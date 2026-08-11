# KLineChart v10.0.0-beta2 更新日志

## 更新日期
2026-05-30

## 最新更新
- ✅ ESM运行时代码已更新为v10.0.0-beta2（从本地源码编译）
- ✅ 版本号已正确设置为10.0.0-beta2
- ✅ 所有新API已可用：overrideYAxis, overrideXAxis, CreateIndicatorOptions

## 版本变更
- **从**: v10.0.0-beta1
- **到**: v10.0.0-beta2

## 关键API变更

### 1. createIndicator 签名变更

**旧版 (v10.0.0-beta1)**:
```typescript
createIndicator(value: string | IndicatorCreate, isStack?: boolean, paneOptions?: PaneOptions): Nullable<string>
```

**新版 (v10.0.0-beta2)**:
```typescript
createIndicator(value: string | IndicatorCreate, options?: CreateIndicatorOptions): Nullable<string>

interface CreateIndicatorOptions {
  isStack?: boolean;
  pane?: PaneOptions;
  yAxis?: YAxisOverride;
}
```

**迁移方式**:
```typescript
// 旧版
chart.createIndicator(indicator, false, { id: 'pane_id', height: 100 });

// 新版
chart.createIndicator(indicator, {
  isStack: false,
  pane: { id: 'pane_id', height: 100 }
});
```

### 2. 新增 Y-Axis 配置方法

**新增方法**:
- `overrideXAxis(xAxis: XAxisOverride): void` - 配置X轴
- `overrideYAxis(yAxis: YAxisOverride): void` - 配置Y轴

**AxisOverride 接口**:
```typescript
interface AxisOverride {
  name?: string;
  id?: string;
  paneId?: string;
  reverse?: boolean;
  inside?: boolean;
  position?: AxisPosition;
  scrollZoomEnabled?: boolean;
  gap?: AxisGap;
  createRange?: AxisCreateRangeCallback;
  createTicks?: AxisCreateTicksCallback;
}

type YAxisOverride = AxisOverride & { needWidget?: boolean };
type XAxisOverride = Pick<AxisOverride, 'name' | 'scrollZoomEnabled' | 'createTicks'>;
```

### 3. ConvertFilter 新增 yAxisId 字段

```typescript
interface ConvertFilter {
  paneId?: string;
  yAxisId?: string;  // 新增
  absolute?: boolean;
}
```

### 4. PaneOptions 变更

**v10.0.0-beta2 移除了 axis 属性**，但为了向后兼容，当前ESM运行时代码仍支持。

**建议**: 使用 `overrideYAxis()` 方法替代 `setPaneOptions({ axis })` 方式。

## 已修改的文件

### 1. 类型定义文件
- `vendor/klinecharts/index.d.ts` - 更新为v10.0.0-beta2类型定义

### 2. 项目代码文件

#### `src/domains/indicators/runtime.ts`
- 更新了 `mountVolumeIndicator()` - 使用新的 `CreateIndicatorOptions` 格式
- 更新了 `mountMainIndicator()` - 使用新的 `CreateIndicatorOptions` 格式
- 更新了 `mountSignalIndicator()` - 使用新的 `CreateIndicatorOptions` 格式
- 更新了 `mountSignalIndicatorNonePlaceholder()` - 使用新的 `CreateIndicatorOptions` 格式
- **注意**: `setPaneOptions()` 中的 `axis` 配置保留，因为当前ESM运行时仍支持

#### `src/workspaces/custom-indicator/chart/workbenchChartHelpers.ts`
- 更新了 `mountVolumeIndicator()` - 使用新的 `CreateIndicatorOptions` 格式
- 更新了 `mountCustomScriptIndicator()` - 使用新的 `CreateIndicatorOptions` 格式

## 兼容性说明

### 向后兼容
- 当前ESM运行时代码（v10.0.0-beta1）仍然支持 `setPaneOptions({ axis })` 配置
- 类型定义中保留了 `axis` 属性（标记为 `@deprecated`）

### 类型检查
- ✅ TypeScript 类型检查通过
- ✅ Vite 构建成功

## 测试状态

### 类型检查
```bash
npm run typecheck  # ✅ 通过
```

### 构建测试
```bash
npx vite build  # ✅ 成功
```

### 运行时测试
- 需要在实际运行环境中测试图表功能
- 特别关注：
  - 指标创建和显示
  - 图表pane布局
  - Y轴配置
  - 坐标转换功能

## 后续建议

### 1. 更新ESM运行时代码
当klinecharts v10.0.0-beta2正式发布到npm后，建议：
```bash
npm install klinecharts@10.0.0-beta2
```

### 2. 迁移axis配置
将 `setPaneOptions({ axis })` 调用迁移到 `overrideYAxis()` 方法：
```typescript
// 旧方式
chart.setPaneOptions({
  id: 'pane_id',
  axis: { createTicks: customTicks, gap: { top: 0.2, bottom: 0.1 } }
});

// 新方式
chart.overrideYAxis({
  paneId: 'pane_id',
  createTicks: customTicks,
  gap: { top: 0.2, bottom: 0.1 }
});
```

### 3. 利用新特性
- **多Y轴支持**: 通过 `yAxisId` 参数支持同一pane中的多个Y轴
- **独立轴配置**: 使用 `overrideXAxis()` 和 `overrideYAxis()` 方法
- **自动容器大小调整**: 图表现在自动检测容器大小变化

## 参考资料

- [KLineChart v10.0.0-beta2 Release Notes](https://github.com/klinecharts/KLineChart/releases/tag/v10.0.0-beta2)
- 上游源码：[KLineChart](https://github.com/klinecharts/KLineChart)

## 本地补丁

### 2026-06-10 绘图预览与拖拽实时刷新

- 症状: 本地 vendored bundle 的三画布分离优化让 `ChartStore.setCrosshair` 只重绘 crosshair 画布，导致绘制中 overlay 的橡皮筋预览和拖拽中的 overlay 不随鼠标实时刷新。
- 位置: `apps/desktop/web/vendor/klinecharts/index.esm.js` 的 `ChartStore.setCrosshair`。
- 修改: 保留普通浏览 mousemove 只刷新 crosshair 的快路径；当 `isOverlayDrawing()` 为真或 `_pressedOverlayInfo.overlay` 非空时，在刷新 crosshair 前额外执行 `updatePane(1 /* Overlay */)`。
- 同步提醒: 如果从本地 klinecharts fork 源码重新编译 vendor bundle，应把同样逻辑同步到源码的 `src/Store.ts` `setCrosshair` 处，避免重新打包后丢失该补丁。

## 变更统计

- 修改的文件: 4个
- 新增的API: 2个 (overrideXAxis, overrideYAxis)
- 变更的API: 1个 (createIndicator)
- 废弃的API: 1个 (PaneOptions.axis)
