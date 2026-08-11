// SPDX-License-Identifier: GPL-3.0-only

import type {
  BooleanOperand,
  NumericOperand,
  RuntimeFieldAlias,
} from "../runtime/index.js";
import {
  addSeries,
  andSeries,
  divSeries,
  eqSeries,
  gtSeries,
  gteSeries,
  ltSeries,
  lteSeries,
  modSeries,
  mulSeries,
  neqSeries,
  notSeries,
  orSeries,
  powSeries,
  subSeries,
} from "../runtime/operators.js";
import { createRuntimeSeriesContext } from "../runtime/fields.js";
import {
  buildRuntimeMetaSeries,
  resolveExecutionLimits,
  toPositiveInt,
} from "./evaluatorRuntimeHelpers.js";
import {
  asConditionOperand,
  asNumericOperand,
  isScalar,
  normalizeName,
  resolveArrayLength,
  toBooleanSeries,
  toNumericSeries,
} from "./evaluatorValueConversion.js";
import {
  ACOS,
  ABS,
  ALIGNRIGHT,
  AMA,
  AND_FN,
  ASIN,
  ATAN,
  AVEDEV,
  BACKSET,
  BARSNEXT,
  BARSSINCEN,
  BARSLASTCOUNT,
  BARSTATUS,
  BARSSINCE,
  BARSLAST,
  BARSCOUNT,
  BETA,
  BETWEEN,
  BOLL_LOWER,
  BOLL_MID,
  BOLL_UPPER,
  CORR,
  COUNT,
  DATETODAY,
  DAYTODATE,
  COVAR,
  CROSSDOWN,
  CROSSUP,
  CROSS,
  CEILING,
  CONST,
  INTPART,
  DIFF,
  DMA,
  DEVSQ,
  DOWNNDAY,
  COS,
  EMA,
  EXPMA,
  EVERY,
  EXIST,
  EXP,
  EXPMEMA,
  FINDHIGH,
  FINDHIGHBARS,
  FINDLOW,
  FINDLOWBARS,
  FILTER,
  FLOOR,
  FORCAST,
  FRACPART,
  HHVBARS,
  HHV,
  HOD,
  IFF,
  IF,
  KAMA,
  LAST,
  LOD,
  LOWRANGE,
  LN,
  LOG,
  LOG10,
  LOG2,
  LONGCROSS,
  LLVBARS,
  LLV,
  MA,
  MAX,
  MEMA,
  MIN,
  MOD,
  MULAR,
  NDAY,
  NOT_FN,
  OR_FN,
  PEAK,
  POW,
  REVERSE,
  RANGE,
  REF,
  REFDATE,
  REFV,
  REFX,
  REFXV,
  RELATE,
  ROUND,
  ROUND2,
  RAND,
  RSI,
  SECTOTIME,
  SAR,
  SARTURN,
  SIGN,
  SIN,
  SLOPE,
  SMA,
  SMMA,
  SQRT,
  STDP,
  SUMBARS,
  STD,
  SUM,
  TAN,
  TIMETOSEC,
  TFILTER,
  TOPRANGE,
  TMA,
  TROUGHBARS,
  TR,
  TROUGH,
  UPNDAY,
  VALUEWHEN,
  VAR,
  VARP,
  VOLAT,
  XMA,
  ZIG,
  ZIGA,
  ZIGZAG,
  PEAKBARS,
  WMA,
} from "../functions/library.js";
import {
  AstExecutionError,
  type AstAssignmentExpression,
  type AstExecutionContext,
  type AstExecutionResult,
  type AstExecutionState,
  type AstExpression,
  type AstProgram,
  type AstRuntimeValue,
  type AstVariableTable,
} from "../ast/types.js";

const CUSTOM_INDICATOR_EXECUTION_FAILED_MESSAGE =
  "CUSTOM_INDICATOR_EXECUTION_FAILED";
const SCRIPT_STATEMENT_LIMIT_EXCEEDED_MESSAGE =
  "SCRIPT_STATEMENT_LIMIT_EXCEEDED";

const FIELD_ALIASES: RuntimeFieldAlias[] = [
  "OPEN",
  "O",
  "HIGH",
  "H",
  "LOW",
  "L",
  "CLOSE",
  "C",
  "VOL",
  "V",
  "AMOUNT",
];

const createExecutionState = (
  context: AstExecutionContext,
): AstExecutionState => {
  const runtimeSeries = createRuntimeSeriesContext(context.bars);
  const variables: AstVariableTable = {};

  if (context.variables) {
    Object.entries(context.variables).forEach(([key, value]) => {
      variables[normalizeName(key)] = value;
    });
  }

  FIELD_ALIASES.forEach((field) => {
    variables[field] = runtimeSeries[field];
  });
  variables.VOLA = runtimeSeries.AMOUNT;

  Object.assign(variables, buildRuntimeMetaSeries(runtimeSeries.bars));

  return {
    runtimeSeries,
    variables,
    outputs: {},
    intermediateCache: {},
    limits: resolveExecutionLimits(context),
    statementsExecuted: 0,
    operationsExecuted: 0,
  };
};

const consumeOperations = (state: AstExecutionState, units: number) => {
  const delta = toPositiveInt(units, 1);
  const next = state.operationsExecuted + delta;
  if (next > state.limits.maxOperations) {
    throw new AstExecutionError(
      "OPERATION_LIMIT_EXCEEDED",
      `Execution operation limit exceeded: ${String(next)} > ${String(state.limits.maxOperations)}`,
    );
  }
  state.operationsExecuted = next;
};

const runFunctionCall = (
  name: string,
  args: AstRuntimeValue[],
  state: AstExecutionState,
): AstRuntimeValue => {
  const normalized = normalizeName(name);
  const numericArg = (
    index: number,
    fallback: NumericOperand = Number.NaN,
  ): NumericOperand => {
    const value = args[index];
    if (value === undefined) {
      return fallback;
    }
    return asNumericOperand(value);
  };
  const conditionArg = (
    index: number,
    fallback: BooleanOperand | NumericOperand = false,
  ): BooleanOperand | NumericOperand => {
    const value = args[index];
    if (value === undefined) {
      return fallback;
    }
    return asConditionOperand(value);
  };

  switch (normalized) {
    case "REF":
      return REF(numericArg(0), numericArg(1, 1));
    case "REFV":
      return REFV(numericArg(0), numericArg(1, 1));
    case "REFX":
      return REFX(numericArg(0), numericArg(1, 1));
    case "REFXV":
      return REFXV(numericArg(0), numericArg(1, 1));
    case "REFDATE":
      return REFDATE(
        numericArg(0),
        numericArg(1),
        numericArg(2, asNumericOperand(state.variables.DATE ?? Number.NaN)),
      );
    case "DIFF":
      return DIFF(numericArg(0), numericArg(1, 1));
    case "VALUEWHEN":
      return VALUEWHEN(conditionArg(0), numericArg(1));
    case "BARSSINCE":
      return BARSSINCE(conditionArg(0));
    case "BARSSINCEN":
      return BARSSINCEN(conditionArg(0), numericArg(1, 1));
    case "BACKSET":
      return BACKSET(conditionArg(0), numericArg(1, 1));
    case "ALIGNRIGHT":
      return ALIGNRIGHT(numericArg(0));
    case "CONST":
      return CONST(numericArg(0));
    case "MA":
      return MA(numericArg(0), numericArg(1, 5));
    case "EMA":
      return EMA(numericArg(0), numericArg(1, 5));
    case "EXPMA":
      return EXPMA(numericArg(0), numericArg(1, 5));
    case "SMA":
      return SMA(numericArg(0), numericArg(1, 5), numericArg(2, 1));
    case "MEMA":
      return MEMA(numericArg(0), numericArg(1, 5));
    case "SMMA":
      return SMMA(numericArg(0), numericArg(1, 5));
    case "XMA":
      return XMA(numericArg(0), numericArg(1, 5), numericArg(2, 0));
    case "TMA":
      return TMA(numericArg(0), numericArg(1, 5));
    case "AMA":
      return AMA(numericArg(0), numericArg(1, 10));
    case "KAMA":
      return KAMA(numericArg(0), numericArg(1, 10));
    case "EXPMEMA":
      return EXPMEMA(numericArg(0), numericArg(1, 5));
    case "HHV":
      return HHV(numericArg(0), numericArg(1, 5));
    case "LLV":
      return LLV(numericArg(0), numericArg(1, 5));
    case "HHVBARS":
      return HHVBARS(numericArg(0), numericArg(1, 5));
    case "HOD":
      return HOD(numericArg(0), numericArg(1, 5));
    case "LLVBARS":
      return LLVBARS(numericArg(0), numericArg(1, 5));
    case "LOD":
      return LOD(numericArg(0), numericArg(1, 5));
    case "SUM":
      return SUM(numericArg(0), numericArg(1, 5));
    case "MULAR":
      return MULAR(numericArg(0), numericArg(1, 5));
    case "TR":
      return TR(
        numericArg(0, asNumericOperand(state.variables.HIGH ?? Number.NaN)),
        numericArg(1, asNumericOperand(state.variables.LOW ?? Number.NaN)),
        numericArg(2, asNumericOperand(state.variables.CLOSE ?? Number.NaN)),
      );
    case "SUMBARS":
      return SUMBARS(numericArg(0), numericArg(1));
    case "COUNT":
      return COUNT(conditionArg(0), numericArg(1, 5));
    case "EVERY":
      return EVERY(conditionArg(0), numericArg(1, 5));
    case "EXIST":
      return EXIST(conditionArg(0), numericArg(1, 5));
    case "LAST":
      return LAST(conditionArg(0), numericArg(1, 5), numericArg(2, 1));
    case "MAX":
      return MAX(numericArg(0), numericArg(1));
    case "MIN":
      return MIN(numericArg(0), numericArg(1));
    case "ABS":
      return ABS(numericArg(0));
    case "REVERSE":
      return REVERSE(numericArg(0));
    case "SIGN":
    case "SGN":
      return SIGN(numericArg(0));
    case "MOD":
      return MOD(numericArg(0), numericArg(1));
    case "POW":
      return POW(numericArg(0), numericArg(1));
    case "SQRT":
      return SQRT(numericArg(0));
    case "LOG":
      return LOG(numericArg(0));
    case "LN":
      return LN(numericArg(0));
    case "LOG10":
      return LOG10(numericArg(0));
    case "LOG2":
      return LOG2(numericArg(0));
    case "EXP":
      return EXP(numericArg(0));
    case "SIN":
      return SIN(numericArg(0));
    case "COS":
      return COS(numericArg(0));
    case "TAN":
      return TAN(numericArg(0));
    case "ASIN":
      return ASIN(numericArg(0));
    case "ACOS":
      return ACOS(numericArg(0));
    case "ATAN":
      return ATAN(numericArg(0));
    case "CEILING":
      return CEILING(numericArg(0));
    case "INTPART":
    case "INT":
      return INTPART(numericArg(0));
    case "FLOOR":
      return FLOOR(numericArg(0));
    case "ROUND":
      return ROUND(numericArg(0), numericArg(1, 0));
    case "ROUND2":
      return ROUND2(numericArg(0), numericArg(1, 0));
    case "FRACPART":
      return FRACPART(numericArg(0));
    case "RAND":
      return RAND(numericArg(0, 2_147_483_647));
    case "DATETODAY":
      return DATETODAY(numericArg(0));
    case "DAYTODATE":
      return DAYTODATE(numericArg(0));
    case "TIMETOSEC":
      return TIMETOSEC(numericArg(0));
    case "SECTOTIME":
      return SECTOTIME(numericArg(0));
    case "INPUT":
      return numericArg(1, numericArg(0));
    case "OPEN":
    case "O":
    case "HIGH":
    case "H":
    case "LOW":
    case "L":
    case "CLOSE":
    case "C":
    case "VOL":
    case "VOLA":
    case "V":
    case "AMOUNT":
    case "TOTALVOL":
    case "TOTALAMOUNT":
    case "PERIOD":
    case "DATE":
    case "TIME":
    case "TIME2":
    case "YEAR":
    case "MONTH":
    case "WEEKOFYEAR":
    case "DAY":
    case "HOUR":
    case "MINUTE":
    case "SECOND":
    case "WEEKDAY":
    case "FROMOPEN":
    case "TOTALFZNUM":
    case "CURRBARSCOUNT":
    case "TOTALBARSCOUNT":
    case "ISLASTBAR":
    case "TRUE":
    case "FALSE": {
      const variableValue = state.variables[normalized];
      if (variableValue !== undefined) {
        return variableValue;
      }
      throw new Error("CUSTOM_INDICATOR_UNKNOWN_VARIABLE_FUNCTION");
    }
    case "NULL":
    case "DRAWNULL":
      return Number.NaN;
    case "IF":
      return IF(conditionArg(0), numericArg(1), numericArg(2));
    case "IFF":
      return IFF(conditionArg(0), numericArg(1), numericArg(2));
    case "NOT":
      return NOT_FN(conditionArg(0));
    case "AND":
      return AND_FN(conditionArg(0), conditionArg(1));
    case "OR":
      return OR_FN(conditionArg(0), conditionArg(1));
    case "BETWEEN":
      return BETWEEN(numericArg(0), numericArg(1), numericArg(2));
    case "RANGE":
      return RANGE(numericArg(0), numericArg(1), numericArg(2));
    case "TOPRANGE":
      return TOPRANGE(numericArg(0));
    case "LOWRANGE":
      return LOWRANGE(numericArg(0));
    case "FINDHIGH":
      return FINDHIGH(
        numericArg(0),
        numericArg(1, 0),
        numericArg(2, 0),
        numericArg(3, 1),
      );
    case "FINDHIGHBARS":
      return FINDHIGHBARS(
        numericArg(0),
        numericArg(1, 0),
        numericArg(2, 0),
        numericArg(3, 1),
      );
    case "FINDLOW":
      return FINDLOW(
        numericArg(0),
        numericArg(1, 0),
        numericArg(2, 0),
        numericArg(3, 1),
      );
    case "FINDLOWBARS":
      return FINDLOWBARS(
        numericArg(0),
        numericArg(1, 0),
        numericArg(2, 0),
        numericArg(3, 1),
      );
    case "CROSS":
      return CROSS(numericArg(0), numericArg(1));
    case "CROSSUP":
      return CROSSUP(numericArg(0), numericArg(1));
    case "CROSSDOWN":
      return CROSSDOWN(numericArg(0), numericArg(1));
    case "LONGCROSS":
      return LONGCROSS(numericArg(0), numericArg(1), numericArg(2, 5));
    case "FILTER":
      return FILTER(conditionArg(0), numericArg(1, 1));
    case "TFILTER":
      return TFILTER(conditionArg(0), conditionArg(1), numericArg(2, 0));
    case "UPNDAY":
      return UPNDAY(numericArg(0), numericArg(1, 1));
    case "DOWNNDAY":
      return DOWNNDAY(numericArg(0), numericArg(1, 1));
    case "NDAY":
      return NDAY(numericArg(0), numericArg(1), numericArg(2, 1));
    case "BARSLAST":
      return BARSLAST(conditionArg(0));
    case "BARSNEXT":
      return BARSNEXT(conditionArg(0));
    case "BARSLASTCOUNT":
      return BARSLASTCOUNT(conditionArg(0));
    case "BARSCOUNT":
      return BARSCOUNT(numericArg(0));
    case "BARSTATUS":
      return BARSTATUS(numericArg(0));
    case "STD":
      return STD(numericArg(0), numericArg(1, 5));
    case "WMA":
      return WMA(numericArg(0), numericArg(1, 5));
    case "DMA":
      return DMA(numericArg(0), numericArg(1, 0.5));
    case "AVEDEV":
      return AVEDEV(numericArg(0), numericArg(1, 5));
    case "VAR":
      return VAR(numericArg(0), numericArg(1, 5));
    case "VARP":
      return VARP(numericArg(0), numericArg(1, 5));
    case "STDP":
      return STDP(numericArg(0), numericArg(1, 5));
    case "DEVSQ":
      return DEVSQ(numericArg(0), numericArg(1, 5));
    case "COVAR":
      return COVAR(numericArg(0), numericArg(1), numericArg(2, 5));
    case "CORR":
      return CORR(numericArg(0), numericArg(1), numericArg(2, 5));
    case "RELATE":
      return RELATE(numericArg(0), numericArg(1), numericArg(2, 5));
    case "VOLAT":
      return VOLAT(numericArg(0), numericArg(1, 20), numericArg(2, 250));
    case "BETA":
      return BETA(numericArg(0), numericArg(1), numericArg(2, 5));
    case "SLOPE":
      return SLOPE(numericArg(0), numericArg(1, 5));
    case "FORCAST":
      return FORCAST(numericArg(0), numericArg(1, 5));
    case "SAR":
      return SAR(
        numericArg(0, asNumericOperand(state.variables.HIGH ?? Number.NaN)),
        numericArg(1, asNumericOperand(state.variables.LOW ?? Number.NaN)),
        numericArg(2, 2),
        numericArg(3, 20),
      );
    case "SARTURN":
      return SARTURN(
        numericArg(0, asNumericOperand(state.variables.HIGH ?? Number.NaN)),
        numericArg(1, asNumericOperand(state.variables.LOW ?? Number.NaN)),
        numericArg(2, 2),
        numericArg(3, 20),
      );
    case "ZIG":
      return ZIG(numericArg(0), numericArg(1, 5));
    case "ZIGA":
      return ZIGA(numericArg(0), numericArg(1, 5));
    case "ZIGZAG":
      return ZIGZAG(numericArg(0), numericArg(1, 5));
    case "PEAK":
      return PEAK(numericArg(0), numericArg(1, 5), numericArg(2, 1));
    case "PEAKBARS":
      return PEAKBARS(numericArg(0), numericArg(1, 5), numericArg(2, 1));
    case "TROUGH":
      return TROUGH(numericArg(0), numericArg(1, 5), numericArg(2, 1));
    case "TROUGHBARS":
      return TROUGHBARS(numericArg(0), numericArg(1, 5), numericArg(2, 1));
    case "RSI":
      return RSI(numericArg(0), numericArg(1, 14));
    case "BOLL_MID":
      return BOLL_MID(numericArg(0), numericArg(1, 20));
    case "BOLL_UPPER":
      return BOLL_UPPER(numericArg(0), numericArg(1, 20), numericArg(2, 2));
    case "BOLL_LOWER":
      return BOLL_LOWER(numericArg(0), numericArg(1, 20), numericArg(2, 2));
    case "DRAWICON":
    case "DRAWTEXT":
    case "DRAWNUMBER":
    case "STICKLINE": {
      // Keep draw outputs bar-aligned even when condition/price are scalar literals.
      const condition = conditionArg(0);
      const price = numericArg(1, Number.NaN);
      const length = Math.max(
        state.runtimeSeries.length,
        resolveArrayLength(condition),
        resolveArrayLength(price),
        1,
      );
      const conditionSeries = toBooleanSeries(condition, length);
      const priceSeries = toNumericSeries(price, length);
      const result = new Array<number>(length).fill(Number.NaN);
      for (let index = 0; index < length; index += 1) {
        result[index] = conditionSeries[index]
          ? priceSeries[index]
          : Number.NaN;
      }
      return result;
    }
    case "DRAWLINE": {
      const condition1 = conditionArg(0);
      const price1 = numericArg(1, Number.NaN);
      const condition2 = conditionArg(2);
      const price2 = numericArg(3, Number.NaN);
      const length = Math.max(
        state.runtimeSeries.length,
        resolveArrayLength(condition1),
        resolveArrayLength(price1),
        resolveArrayLength(condition2),
        resolveArrayLength(price2),
        1,
      );
      const conditionSeries1 = toBooleanSeries(condition1, length);
      const priceSeries1 = toNumericSeries(price1, length);
      const conditionSeries2 = toBooleanSeries(condition2, length);
      const priceSeries2 = toNumericSeries(price2, length);
      const result = new Array<number>(length).fill(Number.NaN);
      for (let index = 0; index < length; index += 1) {
        if (conditionSeries1[index]) {
          result[index] = priceSeries1[index];
          continue;
        }
        result[index] = conditionSeries2[index]
          ? priceSeries2[index]
          : Number.NaN;
      }
      return result;
    }
    case "DRAWSL": {
      const condition = conditionArg(0);
      const price = numericArg(1, Number.NaN);
      const length = Math.max(
        state.runtimeSeries.length,
        resolveArrayLength(condition),
        resolveArrayLength(price),
        1,
      );
      const conditionSeries = toBooleanSeries(condition, length);
      const priceSeries = toNumericSeries(price, length);
      const result = new Array<number>(length).fill(Number.NaN);
      for (let index = 0; index < length; index += 1) {
        result[index] = conditionSeries[index]
          ? priceSeries[index]
          : Number.NaN;
      }
      return result;
    }
    case "DRAWKLINE":
      return numericArg(3, Number.NaN);
    case "FILLRGN":
    case "DRAWBAND":
      return numericArg(0, Number.NaN);
    default:
      if (args.length === 0) {
        const variableValue = state.variables[normalized];
        if (variableValue !== undefined) {
          return variableValue;
        }
      }
      throw new Error("CUSTOM_INDICATOR_UNKNOWN_FUNCTION");
  }
};

const evaluateBinary = (
  operator: string,
  left: AstRuntimeValue,
  right: AstRuntimeValue,
  defaultLength: number,
  state: AstExecutionState,
): AstRuntimeValue => {
  const hasSeriesOperand = Array.isArray(left) || Array.isArray(right);

  if (!hasSeriesOperand && isScalar(left) && isScalar(right)) {
    consumeOperations(state, 1);

    if (operator === "+") {
      return Number(left) + Number(right);
    }
    if (operator === "-") {
      return Number(left) - Number(right);
    }
    if (operator === "*") {
      return Number(left) * Number(right);
    }
    if (operator === "/") {
      return Number(right) === 0 ? Number.NaN : Number(left) / Number(right);
    }
    if (operator === "%") {
      return Number(right) === 0 ? Number.NaN : Number(left) % Number(right);
    }
    if (operator === "^") {
      const next = Math.pow(Number(left), Number(right));
      return Number.isFinite(next) ? next : Number.NaN;
    }
    if (operator === ">") {
      return Number(left) > Number(right);
    }
    if (operator === ">=") {
      return Number(left) >= Number(right);
    }
    if (operator === "<") {
      return Number(left) < Number(right);
    }
    if (operator === "<=") {
      return Number(left) <= Number(right);
    }
    if (operator === "==") {
      return Number(left) === Number(right);
    }
    if (operator === "!=") {
      return Number(left) !== Number(right);
    }
    if (operator === "AND") {
      return Boolean(left) && Boolean(right);
    }
    if (operator === "OR") {
      return Boolean(left) || Boolean(right);
    }
  }

  const length = Math.max(
    resolveArrayLength(left),
    resolveArrayLength(right),
    defaultLength,
  );
  consumeOperations(state, length);

  const numericLeft = asNumericOperand(left);
  const numericRight = asNumericOperand(right);

  switch (operator) {
    case "+":
      return addSeries(numericLeft, numericRight, length);
    case "-":
      return subSeries(numericLeft, numericRight, length);
    case "*":
      return mulSeries(numericLeft, numericRight, length);
    case "/":
      return divSeries(numericLeft, numericRight, length);
    case "%":
      return modSeries(numericLeft, numericRight, length);
    case "^":
      return powSeries(numericLeft, numericRight, length);
    case ">":
      return gtSeries(numericLeft, numericRight, length);
    case ">=":
      return gteSeries(numericLeft, numericRight, length);
    case "<":
      return ltSeries(numericLeft, numericRight, length);
    case "<=":
      return lteSeries(numericLeft, numericRight, length);
    case "==":
      return eqSeries(numericLeft, numericRight, length);
    case "!=":
      return neqSeries(numericLeft, numericRight, length);
    case "AND": {
      const boolLeft = toBooleanSeries(left, length);
      const boolRight = toBooleanSeries(right, length);
      return andSeries(boolLeft, boolRight, length);
    }
    case "OR": {
      const boolLeft = toBooleanSeries(left, length);
      const boolRight = toBooleanSeries(right, length);
      return orSeries(boolLeft, boolRight, length);
    }
    default:
      throw new Error("CUSTOM_INDICATOR_UNSUPPORTED_BINARY_OPERATOR");
  }
};

const evaluateUnary = (
  operator: string,
  argument: AstRuntimeValue,
  defaultLength: number,
  state: AstExecutionState,
): AstRuntimeValue => {
  if (operator === "+") {
    if (isScalar(argument)) {
      consumeOperations(state, 1);
      return Number(argument);
    }
    const length = Math.max(resolveArrayLength(argument), defaultLength);
    consumeOperations(state, length);
    return toNumericSeries(argument, length);
  }

  if (operator === "-") {
    if (isScalar(argument)) {
      consumeOperations(state, 1);
      return -Number(argument);
    }
    const length = Math.max(resolveArrayLength(argument), defaultLength);
    consumeOperations(state, length);
    return mulSeries(toNumericSeries(argument, length), -1, length);
  }

  if (operator === "NOT") {
    if (isScalar(argument)) {
      consumeOperations(state, 1);
      return !Boolean(argument);
    }
    const length = Math.max(resolveArrayLength(argument), defaultLength);
    consumeOperations(state, length);
    return notSeries(toBooleanSeries(argument, length), length);
  }

  throw new Error("CUSTOM_INDICATOR_UNSUPPORTED_UNARY_OPERATOR");
};

export const evaluateAstExpression = (
  expression: AstExpression,
  context: AstExecutionContext,
): AstRuntimeValue => {
  const state = createExecutionState(context);
  return evaluateExpressionInState(expression, state);
};

export const evaluateExpressionInState = (
  expression: AstExpression,
  state: AstExecutionState,
): AstRuntimeValue => {
  switch (expression.type) {
    case "NumberLiteral":
      return expression.value;
    case "StringLiteral":
      return expression.value;
    case "Identifier": {
      const key = normalizeName(expression.name);
      const value = state.variables[key];
      if (value === undefined) {
        if (key.startsWith("COLOR")) {
          return key;
        }
        throw new Error("CUSTOM_INDICATOR_UNKNOWN_IDENTIFIER");
      }
      return value;
    }
    case "UnaryExpression": {
      const argument = evaluateExpressionInState(expression.argument, state);
      return evaluateUnary(
        expression.operator,
        argument,
        state.runtimeSeries.length,
        state,
      );
    }
    case "BinaryExpression": {
      const left = evaluateExpressionInState(expression.left, state);
      const right = evaluateExpressionInState(expression.right, state);
      return evaluateBinary(
        expression.operator,
        left,
        right,
        state.runtimeSeries.length,
        state,
      );
    }
    case "FunctionCall": {
      const args = expression.args.map((arg) =>
        evaluateExpressionInState(arg, state),
      );
      const length = Math.max(
        1,
        ...args.map((item) => resolveArrayLength(item)),
      );
      consumeOperations(state, length);
      return runFunctionCall(expression.callee, args, state);
    }
    default:
      throw new Error("CUSTOM_INDICATOR_UNSUPPORTED_AST_EXPRESSION");
  }
};

const executeAssignment = (
  assignment: AstAssignmentExpression,
  state: AstExecutionState,
) => {
  const key = normalizeName(assignment.target);
  const value = evaluateExpressionInState(assignment.expression, state);
  state.variables[key] = value;
  if (assignment.operator === ":=") {
    state.intermediateCache[key] = value;
  } else {
    state.outputs[key] = value;
  }
};

const toExecutionError = (
  error: unknown,
  statement: AstAssignmentExpression,
  statementIndex: number,
): AstExecutionError => {
  const detail =
    error instanceof Error
      ? error.message
      : CUSTOM_INDICATOR_EXECUTION_FAILED_MESSAGE;

  if (error instanceof AstExecutionError) {
    if (
      typeof error.statementIndex === "number" &&
      error.statementTarget &&
      error.statementOperator &&
      typeof error.statementLine === "number" &&
      typeof error.statementColumn === "number"
    ) {
      return error;
    }

    return new AstExecutionError(error.code, error.message, {
      statementIndex,
      statementTarget: statement.target,
      statementOperator: statement.operator,
      statementLine: statement.line,
      statementColumn: statement.column,
      causeMessage: error.causeMessage ?? detail,
    });
  }

  return new AstExecutionError(
    "STATEMENT_EXECUTION_FAILED",
    `Statement ${String(statementIndex)} [${statement.target} ${statement.operator}] failed: ${detail}`,
    {
      statementIndex,
      statementTarget: statement.target,
      statementOperator: statement.operator,
      statementLine: statement.line,
      statementColumn: statement.column,
      causeMessage: detail,
    },
  );
};

export const executeAstProgram = (
  program: AstProgram,
  context: AstExecutionContext,
): AstExecutionResult => {
  const state = createExecutionState(context);

  if (program.body.length > state.limits.maxStatements) {
    throw new AstExecutionError(
      "STATEMENT_LIMIT_EXCEEDED",
      `Execution statement limit exceeded: ${String(program.body.length)} > ${String(state.limits.maxStatements)}`,
      {
        statementIndex: 0,
        causeMessage: SCRIPT_STATEMENT_LIMIT_EXCEEDED_MESSAGE,
      },
    );
  }

  program.body.forEach((statement, index) => {
    const statementIndex = index + 1;
    try {
      consumeOperations(state, 1);
      executeAssignment(statement, state);
      state.statementsExecuted += 1;
    } catch (error) {
      throw toExecutionError(error, statement, statementIndex);
    }
  });

  return {
    outputs: state.outputs,
    variables: state.variables,
    intermediateCache: state.intermediateCache,
    state,
    stats: {
      statementsExecuted: state.statementsExecuted,
      operationsExecuted: state.operationsExecuted,
    },
  };
};
