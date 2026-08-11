// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { BaseTimeframe } from "@/domains/chart/chartPeriods";
import {
  type CardDropHit,
  type CardReorderGesture,
  type HallSection,
  type PoolSettingsRow,
} from "@/workspaces/data/dataConfig/model";

type UseDataConfigCardReorderInput = {
  deletingSamplePoolId: string;
  isActive: boolean;
  isCardReorderBlocked: boolean;
  moveCustomPoolWithinTimeframe: (
    sourcePoolId: string,
    targetPoolId: string,
  ) => void;
  poolSettingsById: Map<string, PoolSettingsRow>;
};

export const buildHallSectionsWithDragPreview = (
  hallSections: HallSection[],
  draggingPoolId: string,
  dragOverPoolId: string,
): HallSection[] => {
  if (!draggingPoolId || !dragOverPoolId) {
    return hallSections;
  }
  return hallSections.map((section) => {
    const draggedIndex = section.items.findIndex(
      (item) =>
        item.type === "READY" &&
        String(item.pool.id || "").trim() === draggingPoolId,
    );
    const targetIndex = section.items.findIndex(
      (item) =>
        item.type === "READY" &&
        String(item.pool.id || "").trim() === dragOverPoolId,
    );
    if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
      return section;
    }
    const nextItems = [...section.items];
    const [draggedItem] = nextItems.splice(draggedIndex, 1);
    if (!draggedItem) {
      return section;
    }
    nextItems.splice(targetIndex, 0, draggedItem);
    return {
      ...section,
      items: nextItems,
    };
  });
};

export const useDataConfigCardReorder = ({
  deletingSamplePoolId,
  isActive,
  isCardReorderBlocked,
  moveCustomPoolWithinTimeframe,
  poolSettingsById,
}: UseDataConfigCardReorderInput) => {
  const [draggingPoolId, setDraggingPoolId] = useState("");
  const [dragOverPoolId, setDragOverPoolId] = useState("");
  const dragOverPoolIdRef = useRef("");
  const dragGestureRef = useRef<CardReorderGesture | null>(null);
  const suppressNextCardClickRef = useRef(false);
  const cardElementMapRef = useRef(new Map<string, HTMLElement>());
  const previousCardRectMapRef = useRef(new Map<string, DOMRect>());
  const cardElementRefCallbackMapRef = useRef(
    new Map<string, (node: HTMLElement | null) => void>(),
  );

  useEffect(() => {
    if (isActive || !draggingPoolId) {
      return;
    }
    dragGestureRef.current = null;
    setDraggingPoolId("");
    dragOverPoolIdRef.current = "";
    setDragOverPoolId("");
  }, [draggingPoolId, isActive]);

  useEffect(() => {
    if (!draggingPoolId) {
      return;
    }
    if (!poolSettingsById.has(draggingPoolId)) {
      setDraggingPoolId("");
      dragOverPoolIdRef.current = "";
      setDragOverPoolId("");
    }
  }, [draggingPoolId, poolSettingsById]);

  useEffect(() => {
    if (!isCardReorderBlocked || !draggingPoolId) {
      return;
    }
    dragGestureRef.current = null;
    setDraggingPoolId("");
    dragOverPoolIdRef.current = "";
    setDragOverPoolId("");
  }, [draggingPoolId, isCardReorderBlocked]);

  const beginCardReorder = (
    event: ReactPointerEvent<HTMLElement>,
    poolId: string,
    baseTimeframe: BaseTimeframe,
  ) => {
    if (event.button !== 0 || !isActive || isCardReorderBlocked) {
      return;
    }
    const targetElement = event.target as HTMLElement | null;
    if (
      targetElement?.closest(
        'button, input, select, textarea, a, [role="button"], [role="menuitem"], [data-no-card-drag="true"]',
      )
    ) {
      return;
    }
    dragGestureRef.current = {
      pointerId: event.pointerId,
      poolId,
      baseTimeframe,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      sourceElement: event.currentTarget,
    };
    suppressNextCardClickRef.current = false;
    setDraggingPoolId(poolId);
    dragOverPoolIdRef.current = "";
    setDragOverPoolId("");
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some environments may not support pointer capture on this element.
    }
  };

  const resolveCardDropHit = useCallback(
    (
      gesture: CardReorderGesture,
      clientX: number,
      clientY: number,
    ): CardDropHit => {
      if (typeof document === "undefined") {
        return { kind: "NONE" };
      }
      const hitElement = document.elementFromPoint(
        clientX,
        clientY,
      ) as HTMLElement | null;
      const cardElement = hitElement?.closest<HTMLElement>(
        "[data-pool-card-id]",
      );
      const targetPoolId = String(cardElement?.dataset.poolCardId || "").trim();
      if (!targetPoolId) {
        return { kind: "NONE" };
      }
      if (targetPoolId === gesture.poolId) {
        return { kind: "SELF" };
      }
      const targetPool = poolSettingsById.get(targetPoolId);
      if (!targetPool || targetPool.status !== "READY") {
        return { kind: "NONE" };
      }
      if (targetPool.baseTimeframe !== gesture.baseTimeframe) {
        return { kind: "NONE" };
      }
      if (deletingSamplePoolId === targetPoolId) {
        return { kind: "NONE" };
      }
      return {
        kind: "TARGET",
        targetPoolId,
      };
    },
    [deletingSamplePoolId, poolSettingsById],
  );

  const applyCardReorderTargetByPoint = useCallback(
    (gesture: CardReorderGesture, clientX: number, clientY: number) => {
      const hit = resolveCardDropHit(gesture, clientX, clientY);
      if (hit.kind === "TARGET") {
        if (dragOverPoolIdRef.current !== hit.targetPoolId) {
          dragOverPoolIdRef.current = hit.targetPoolId;
          setDragOverPoolId(hit.targetPoolId);
        }
        return;
      }
      if (hit.kind === "SELF") {
        return;
      }
      if (dragOverPoolIdRef.current) {
        dragOverPoolIdRef.current = "";
        setDragOverPoolId("");
      }
    },
    [resolveCardDropHit],
  );

  const finalizeCardReorder = useCallback(
    (gesture: CardReorderGesture, clientX: number, clientY: number) => {
      try {
        gesture.sourceElement?.releasePointerCapture(gesture.pointerId);
      } catch {
        // Pointer capture may already be released by runtime.
      }
      const dropHit = resolveCardDropHit(gesture, clientX, clientY);
      const finalDragOverPoolId =
        dropHit.kind === "TARGET"
          ? dropHit.targetPoolId
          : dropHit.kind === "SELF"
            ? String(dragOverPoolIdRef.current || "").trim()
            : "";
      if (
        gesture.moved &&
        finalDragOverPoolId &&
        finalDragOverPoolId !== gesture.poolId
      ) {
        moveCustomPoolWithinTimeframe(gesture.poolId, finalDragOverPoolId);
      }
      suppressNextCardClickRef.current = gesture.moved;
      dragGestureRef.current = null;
      dragOverPoolIdRef.current = "";
      setDragOverPoolId("");
      setDraggingPoolId("");
    },
    [moveCustomPoolWithinTimeframe, resolveCardDropHit],
  );

  useEffect(() => {
    if (!isActive || !draggingPoolId) {
      return;
    }
    const onWindowPointerMove = (event: globalThis.PointerEvent) => {
      const gesture = dragGestureRef.current;
      if (
        !gesture ||
        gesture.pointerId !== event.pointerId ||
        draggingPoolId !== gesture.poolId
      ) {
        return;
      }
      const moveDistance =
        Math.abs(event.clientX - gesture.startX) +
        Math.abs(event.clientY - gesture.startY);
      if (!gesture.moved && moveDistance < 6) {
        return;
      }
      if (!gesture.moved) {
        gesture.moved = true;
        suppressNextCardClickRef.current = true;
      }
      event.preventDefault();
      applyCardReorderTargetByPoint(gesture, event.clientX, event.clientY);
    };

    const onWindowPointerEnd = (event: globalThis.PointerEvent) => {
      const gesture = dragGestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) {
        return;
      }
      finalizeCardReorder(gesture, event.clientX, event.clientY);
    };

    window.addEventListener("pointermove", onWindowPointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", onWindowPointerEnd);
    window.addEventListener("pointercancel", onWindowPointerEnd);
    return () => {
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerEnd);
      window.removeEventListener("pointercancel", onWindowPointerEnd);
    };
  }, [applyCardReorderTargetByPoint, finalizeCardReorder, draggingPoolId, isActive]);

  return {
    beginCardReorder,
    cardElementMapRef,
    cardElementRefCallbackMapRef,
    dragOverPoolId,
    draggingPoolId,
    previousCardRectMapRef,
    suppressNextCardClickRef,
  };
};
