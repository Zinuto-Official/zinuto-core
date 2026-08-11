// SPDX-License-Identifier: GPL-3.0-only

import {
  DESKTOP_LEGAL_DOCUMENT_VERSION,
  desktopLegalDocumentResponseSchema,
  desktopLocalLegalDocumentKeySchema,
  normalizeDesktopLegalDocumentLocale,
  type DesktopLegalDocumentResponse,
  type DesktopLocalLegalDocumentKey,
  type DesktopLocalLegalDocumentLocale,
} from "@zinuto/shared/desktopLegalDocuments";

const LEGAL_DOCUMENT_DATE = "2026-08-12";
const LEGAL_DOCUMENT_TIMESTAMP = "2026-08-12T00:00:00.000Z";
const DOCUMENTS: Record<
  DesktopLocalLegalDocumentKey,
  Record<DesktopLocalLegalDocumentLocale, string>
> = {
  privacy: {
    en: `# Privacy

Zinuto Core stores workspaces, imported market data, training history, notes, indicators, and local achievements on this device.

Zinuto Core works locally. It does not connect to Zinuto online services or send product activity or workspace content to them.`,
    "zh-CN": `# 隐私

Zinuto Core 将工作区、导入的行情数据、训练历史、笔记、指标和本地荣誉保存在本机。

Zinuto Core 在本机运行，不连接 Zinuto 在线服务，也不会向其发送使用情况或工作区内容。`,
    ja: `# プライバシー

Zinuto Core はワークスペース、取り込んだ市場データ、練習履歴、メモ、指標、端末内の実績をこの端末に保存します。

Zinuto Core は端末内で動作します。Zinuto のオンラインサービスへ接続せず、利用状況やワークスペースの内容も送信しません。`,
    ko: `# 개인정보

Zinuto Core는 작업 공간, 가져온 시세 데이터, 훈련 기록, 노트, 지표와 로컬 성과를 이 기기에 저장합니다.

Zinuto Core는 이 기기에서 작동합니다. Zinuto 온라인 서비스에 연결하지 않으며 사용 기록이나 작업 공간 내용도 보내지 않습니다.`,
    es: `# Privacidad

Zinuto Core guarda en este dispositivo los espacios de trabajo, datos de mercado importados, historial de práctica, notas, indicadores y logros locales.

Zinuto Core funciona en el dispositivo. No se conecta a los servicios en línea de Zinuto ni les envía datos de uso o contenido de los espacios de trabajo.`,
  },
  terms: {
    en: `# Terms of use

Zinuto Core is educational software and does not provide investment, legal, tax, or financial advice. Simulated results do not predict real trading outcomes.

You are responsible for the right to use and redistribute imported or exported third-party data. Transfer packages are not encrypted and must be stored securely.

Source-code rights are governed by GPL-3.0-only and the notices in this repository. Project names and logos may be governed separately by trademark policy.`,
    "zh-CN": `# 使用条款

Zinuto Core 是教学与训练软件，不提供投资、法律、税务或财务建议。模拟结果不能预测真实交易结果。

你需要自行确认有权使用和再分发导入或导出的第三方数据。迁移包不加密，应妥善保存。

源代码权利以 GPL-3.0-only 及本仓库声明为准；项目名称和标志可能另受商标政策约束。`,
    ja: `# 利用規約

Zinuto Core は教育・練習用ソフトウェアであり、投資、法律、税務、財務の助言を提供しません。シミュレーション結果は実取引の結果を予測しません。

取り込みまたは書き出す第三者データを利用、再配布する権利は利用者が確認してください。移行パッケージは暗号化されないため、安全に保管してください。

ソースコードの権利は GPL-3.0-only と本リポジトリの表示に従います。名称とロゴには別途商標方針が適用される場合があります。`,
    ko: `# 이용 약관

Zinuto Core는 교육 및 훈련용 소프트웨어이며 투자, 법률, 세무 또는 금융 조언을 제공하지 않습니다. 시뮬레이션 결과는 실제 거래 결과를 예측하지 않습니다.

가져오거나 내보내는 제3자 데이터를 사용하고 재배포할 권리는 사용자가 확인해야 합니다. 이전 패키지는 암호화되지 않으므로 안전하게 보관해야 합니다.

소스 코드 권리는 GPL-3.0-only와 이 저장소의 고지에 따릅니다. 프로젝트 이름과 로고에는 별도의 상표 정책이 적용될 수 있습니다.`,
    es: `# Condiciones de uso

Zinuto Core es software educativo y no ofrece asesoramiento de inversión, legal, fiscal ni financiero. Los resultados simulados no predicen resultados reales.

Debes confirmar tu derecho a usar y redistribuir los datos de terceros que importes o exportes. Los paquetes de transferencia no están cifrados y deben guardarse de forma segura.

Los derechos del código se rigen por GPL-3.0-only y los avisos de este repositorio. Los nombres y logotipos pueden estar sujetos a una política de marcas separada.`,
  },
};

export const createDesktopLegalDocumentsService = () => {
  const getLegalDocument = async ({
    documentKey,
    locale,
  }: {
    documentKey: unknown;
    locale: unknown;
  }): Promise<DesktopLegalDocumentResponse> => {
    const parsedDocumentKey = desktopLocalLegalDocumentKeySchema.parse(documentKey);
    const parsedLocale = normalizeDesktopLegalDocumentLocale(locale);
    return desktopLegalDocumentResponseSchema.parse({
      documentKey: parsedDocumentKey,
      locale: parsedLocale,
      documentVersion: DESKTOP_LEGAL_DOCUMENT_VERSION,
      lastUpdated: LEGAL_DOCUMENT_DATE,
      effectiveDate: LEGAL_DOCUMENT_DATE,
      markdown: DOCUMENTS[parsedDocumentKey][parsedLocale],
      sourceUrl: `app://legal/${parsedDocumentKey}`,
      cacheStatus: "local",
      fetchedAt: LEGAL_DOCUMENT_TIMESTAMP,
      checkedAt: LEGAL_DOCUMENT_TIMESTAMP,
    });
  };

  return {
    getLegalDocument,
    refreshLegalDocumentsCache: async (): Promise<void> => undefined,
    waitForPendingRefresh: async (): Promise<void> => undefined,
  };
};

export const desktopLegalDocumentsService = createDesktopLegalDocumentsService();
export const getDesktopLegalDocument = desktopLegalDocumentsService.getLegalDocument;
