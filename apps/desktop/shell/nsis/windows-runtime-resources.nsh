; SPDX-License-Identifier: GPL-3.0-only

; This callback runs before Tauri starts its WebView2 bootstrapper section.
; The PREINSTALL hook below is intentionally too late for a compatibility check.
!define MUI_CUSTOMFUNCTION_GUIINIT ZinutoCheckWindowsSystemRequirement

LangString ZinutoWindowsSystemRequirement ${LANG_ENGLISH} "This installer requires Windows 10 64-bit or later."
LangString ZinutoWindowsSystemRequirement ${LANG_SIMPCHINESE} "安装此应用需要 Windows 10 64 位及以上版本。"
LangString ZinutoWindowsSystemRequirement ${LANG_JAPANESE} "このアプリをインストールするには、Windows 10 64 ビット以降が必要です。"
LangString ZinutoWindowsSystemRequirement ${LANG_KOREAN} "이 앱을 설치하려면 Windows 10 64비트 이상이 필요합니다."
LangString ZinutoWindowsSystemRequirement ${LANG_SPANISH} "Para instalar esta aplicación se requiere Windows 10 de 64 bits o posterior."

Function ZinutoCheckWindowsSystemRequirement
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "$(ZinutoWindowsSystemRequirement)"
    Quit
  ${EndIf}

  SetRegView 64
  ClearErrors
  ReadRegDWORD $R0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentMajorVersionNumber"
  SetRegView 32
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONSTOP "$(ZinutoWindowsSystemRequirement)"
    Quit
  ${EndIf}
  ${If} $R0 < 10
    MessageBox MB_OK|MB_ICONSTOP "$(ZinutoWindowsSystemRequirement)"
    Quit
  ${EndIf}
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ; Upgrades must not mix old runtime files with the new bundle. Before
  ; unpacking, remove the known generated runtime paths from any previous
  ; release. Only these documented directories are touched; user data under
  ; $APPDATA and files outside the runtime layout are never removed.
  Delete "$INSTDIR\runtime-manifest.json"
  RMDir /r "$INSTDIR\apps"
  RMDir /r "$INSTDIR\node_modules"
  RMDir /r "$INSTDIR\backtest-engine"
  RMDir /r "$INSTDIR\market-data-acquisition"
  RMDir /r "$INSTDIR\node-runtime"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$INSTDIR\runtime-manifest.json"
  RMDir /r "$INSTDIR\apps"
  RMDir /r "$INSTDIR\node_modules"
  RMDir /r "$INSTDIR\backtest-engine"
  RMDir /r "$INSTDIR\market-data-acquisition"
  RMDir /r "$INSTDIR\node-runtime"
!macroend
