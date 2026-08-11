// SPDX-License-Identifier: GPL-3.0-only

pub(crate) const DESKTOP_UI_LANGUAGE_EVENT: &str = "zinuto://desktop-ui-language";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum DesktopUiLanguage {
    En,
    ZhCn,
    Ja,
    Ko,
    Es,
}

impl DesktopUiLanguage {
    pub(crate) fn from_tag(value: &str) -> Option<Self> {
        let tag = value.trim().to_ascii_lowercase();
        if tag == "en" || tag.starts_with("en-") {
            return Some(Self::En);
        }
        if tag == "zh" || tag == "zh-cn" || tag.starts_with("zh-hans") {
            return Some(Self::ZhCn);
        }
        if tag == "ja" || tag.starts_with("ja-") {
            return Some(Self::Ja);
        }
        if tag == "ko" || tag.starts_with("ko-") {
            return Some(Self::Ko);
        }
        if tag == "es" || tag.starts_with("es-") {
            return Some(Self::Es);
        }
        None
    }

    pub(crate) fn from_event_payload(payload: &str) -> Option<Self> {
        let value: serde_json::Value = serde_json::from_str(payload).ok()?;
        let language = value
            .as_str()
            .or_else(|| value.get("language").and_then(serde_json::Value::as_str))?;
        Self::from_tag(language)
    }
}

#[derive(Clone, Copy)]
pub(crate) struct DesktopChromeCopy {
    pub(crate) about_template: &'static str,
    pub(crate) close_window: &'static str,
    pub(crate) copy: &'static str,
    pub(crate) cut: &'static str,
    pub(crate) data_management: &'static str,
    pub(crate) edit: &'static str,
    pub(crate) file: &'static str,
    pub(crate) free_replay: &'static str,
    pub(crate) help: &'static str,
    pub(crate) hide_others: &'static str,
    pub(crate) hide_template: &'static str,
    pub(crate) import_market_data: &'static str,
    pub(crate) keyboard_shortcuts: &'static str,
    pub(crate) maximize: &'static str,
    pub(crate) minimize: &'static str,
    pub(crate) new_free_replay: &'static str,
    pub(crate) paste: &'static str,
    pub(crate) quit_template: &'static str,
    pub(crate) redo: &'static str,
    pub(crate) select_all: &'static str,
    pub(crate) services: &'static str,
    pub(crate) settings: &'static str,
    pub(crate) training_center: &'static str,
    pub(crate) tray_open_template: &'static str,
    pub(crate) undo: &'static str,
    pub(crate) view: &'static str,
    pub(crate) window: &'static str,
}

impl DesktopChromeCopy {
    pub(crate) fn for_language(language: DesktopUiLanguage) -> Self {
        match language {
            DesktopUiLanguage::En => Self {
                about_template: "About {product}",
                close_window: "Close Window",
                copy: "Copy",
                cut: "Cut",
                data_management: "Data Management",
                edit: "Edit",
                file: "File",
                free_replay: "Free Replay",
                help: "Help",
                hide_others: "Hide Others",
                hide_template: "Hide {product}",
                import_market_data: "Import Market Data…",
                keyboard_shortcuts: "Keyboard Shortcuts",
                maximize: "Maximize",
                minimize: "Minimize",
                new_free_replay: "New Free Replay",
                paste: "Paste",
                quit_template: "Quit {product}",
                redo: "Redo",
                select_all: "Select All",
                services: "Services",
                settings: "Settings…",
                training_center: "Training Center",
                tray_open_template: "Open {product}",
                undo: "Undo",
                view: "View",
                window: "Window",
            },
            DesktopUiLanguage::ZhCn => Self {
                about_template: "关于 {product}",
                close_window: "关闭窗口",
                copy: "复制",
                cut: "剪切",
                data_management: "数据管理",
                edit: "编辑",
                file: "文件",
                free_replay: "自由推演",
                help: "帮助",
                hide_others: "隐藏其他窗口",
                hide_template: "隐藏 {product}",
                import_market_data: "导入行情数据…",
                keyboard_shortcuts: "快捷键",
                maximize: "最大化",
                minimize: "最小化",
                new_free_replay: "新建自由推演",
                paste: "粘贴",
                quit_template: "退出 {product}",
                redo: "重做",
                select_all: "全选",
                services: "服务",
                settings: "设置…",
                training_center: "训练中心",
                tray_open_template: "打开 {product}",
                undo: "撤销",
                view: "视图",
                window: "窗口",
            },
            DesktopUiLanguage::Ja => Self {
                about_template: "{product} について",
                close_window: "ウインドウを閉じる",
                copy: "コピー",
                cut: "切り取り",
                data_management: "データ管理",
                edit: "編集",
                file: "ファイル",
                free_replay: "自由リプレイ",
                help: "ヘルプ",
                hide_others: "ほかを隠す",
                hide_template: "{product} を隠す",
                import_market_data: "市場データを読み込む…",
                keyboard_shortcuts: "キーボードショートカット",
                maximize: "最大化",
                minimize: "最小化",
                new_free_replay: "新しい自由リプレイ",
                paste: "ペースト",
                quit_template: "{product} を終了",
                redo: "やり直す",
                select_all: "すべてを選択",
                services: "サービス",
                settings: "設定…",
                training_center: "トレーニングセンター",
                tray_open_template: "{product} を開く",
                undo: "元に戻す",
                view: "表示",
                window: "ウインドウ",
            },
            DesktopUiLanguage::Ko => Self {
                about_template: "{product} 정보",
                close_window: "창 닫기",
                copy: "복사",
                cut: "잘라내기",
                data_management: "데이터 관리",
                edit: "편집",
                file: "파일",
                free_replay: "자유 리플레이",
                help: "도움말",
                hide_others: "다른 항목 가리기",
                hide_template: "{product} 가리기",
                import_market_data: "시세 데이터 가져오기…",
                keyboard_shortcuts: "키보드 단축키",
                maximize: "최대화",
                minimize: "최소화",
                new_free_replay: "새 자유 리플레이",
                paste: "붙여넣기",
                quit_template: "{product} 종료",
                redo: "다시 실행",
                select_all: "모두 선택",
                services: "서비스",
                settings: "설정…",
                training_center: "트레이닝 센터",
                tray_open_template: "{product} 열기",
                undo: "실행 취소",
                view: "보기",
                window: "창",
            },
            DesktopUiLanguage::Es => Self {
                about_template: "Acerca de {product}",
                close_window: "Cerrar ventana",
                copy: "Copiar",
                cut: "Cortar",
                data_management: "Gestión de datos",
                edit: "Editar",
                file: "Archivo",
                free_replay: "Replay libre",
                help: "Ayuda",
                hide_others: "Ocultar las demás",
                hide_template: "Ocultar {product}",
                import_market_data: "Importar datos de mercado…",
                keyboard_shortcuts: "Atajos de teclado",
                maximize: "Maximizar",
                minimize: "Minimizar",
                new_free_replay: "Nuevo replay libre",
                paste: "Pegar",
                quit_template: "Salir de {product}",
                redo: "Rehacer",
                select_all: "Seleccionar todo",
                services: "Servicios",
                settings: "Configuración…",
                training_center: "Centro de entrenamiento",
                tray_open_template: "Abrir {product}",
                undo: "Deshacer",
                view: "Ver",
                window: "Ventana",
            },
        }
    }

    pub(crate) fn with_product(template: &str, product_name: &str) -> String {
        template.replace("{product}", product_name)
    }
}

#[cfg(test)]
mod tests {
    use super::{DesktopChromeCopy, DesktopUiLanguage};

    #[test]
    fn parses_all_supported_ui_language_tags() {
        assert_eq!(
            DesktopUiLanguage::from_tag("en-US"),
            Some(DesktopUiLanguage::En)
        );
        assert_eq!(
            DesktopUiLanguage::from_tag("zh-Hans-CN"),
            Some(DesktopUiLanguage::ZhCn)
        );
        assert_eq!(
            DesktopUiLanguage::from_tag("ja-JP"),
            Some(DesktopUiLanguage::Ja)
        );
        assert_eq!(
            DesktopUiLanguage::from_tag("ko-KR"),
            Some(DesktopUiLanguage::Ko)
        );
        assert_eq!(
            DesktopUiLanguage::from_tag("es-MX"),
            Some(DesktopUiLanguage::Es)
        );
        assert_eq!(DesktopUiLanguage::from_tag("fr"), None);
    }

    #[test]
    fn parses_webview_language_event_payload() {
        assert_eq!(
            DesktopUiLanguage::from_event_payload(r#"{"language":"zh-CN"}"#),
            Some(DesktopUiLanguage::ZhCn)
        );
        assert_eq!(
            DesktopUiLanguage::from_event_payload(r#""es""#),
            Some(DesktopUiLanguage::Es)
        );
        assert_eq!(DesktopUiLanguage::from_event_payload("{}"), None);
    }

    #[test]
    fn keeps_navigation_terms_aligned_across_locales() {
        let expected = [
            (DesktopUiLanguage::En, "Training Center", "Data Management"),
            (DesktopUiLanguage::ZhCn, "训练中心", "数据管理"),
            (DesktopUiLanguage::Ja, "トレーニングセンター", "データ管理"),
            (DesktopUiLanguage::Ko, "트레이닝 센터", "데이터 관리"),
            (
                DesktopUiLanguage::Es,
                "Centro de entrenamiento",
                "Gestión de datos",
            ),
        ];
        for (language, training_center, data_management) in expected {
            let copy = DesktopChromeCopy::for_language(language);
            assert_eq!(copy.training_center, training_center);
            assert_eq!(copy.data_management, data_management);
        }
    }
}
