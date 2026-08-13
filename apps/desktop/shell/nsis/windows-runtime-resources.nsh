; SPDX-License-Identifier: GPL-3.0-only

!define OPEN_TRADING_PRACTICE_SHELL_DIR "${__FILEDIR__}\.."

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

  SetOutPath "$INSTDIR"
  File "${OPEN_TRADING_PRACTICE_SHELL_DIR}\gen\runtime-manifest.json"

  SetOutPath "$INSTDIR\apps"
  File /r "${OPEN_TRADING_PRACTICE_SHELL_DIR}\gen\backend-runtime\apps\*"

  SetOutPath "$INSTDIR\node_modules"
  File /r "${OPEN_TRADING_PRACTICE_SHELL_DIR}\gen\backend-runtime\node_modules\*"

  SetOutPath "$INSTDIR\backtest-engine"
  File /r "${OPEN_TRADING_PRACTICE_SHELL_DIR}\gen\backtest-engine\*"

  SetOutPath "$INSTDIR\market-data-acquisition"
  File /r "${OPEN_TRADING_PRACTICE_SHELL_DIR}\gen\market-data-acquisition\*"

  SetOutPath "$INSTDIR\node-runtime"
  File /oname=node.exe "${OPEN_TRADING_PRACTICE_SHELL_DIR}\runtime\node\bin\node.exe"
  File /nonfatal /r "${OPEN_TRADING_PRACTICE_SHELL_DIR}\gen\node-runtime-libs\*"

  SetOutPath "$INSTDIR"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$INSTDIR\runtime-manifest.json"
  RMDir /r "$INSTDIR\apps"
  RMDir /r "$INSTDIR\node_modules"
  RMDir /r "$INSTDIR\backtest-engine"
  RMDir /r "$INSTDIR\market-data-acquisition"
  RMDir /r "$INSTDIR\node-runtime"
!macroend
