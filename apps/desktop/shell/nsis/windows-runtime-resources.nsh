; SPDX-License-Identifier: GPL-3.0-only

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
