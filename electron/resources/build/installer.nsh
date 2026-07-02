!macro cleanExternalDataRoots MANIFEST_FILE LABEL
  IfFileExists "${MANIFEST_FILE}" 0 done_${LABEL}
  FileOpen $0 "${MANIFEST_FILE}" r
  loop_${LABEL}:
    ClearErrors
    FileRead $0 $1
    IfErrors close_${LABEL}
  trim_${LABEL}:
    StrCpy $2 $1 1 -1
    StrCmp $2 "$\r" trimCut_${LABEL}
    StrCmp $2 "$\n" trimCut_${LABEL}
    Goto trimDone_${LABEL}
  trimCut_${LABEL}:
    StrCpy $1 $1 -1
    Goto trim_${LABEL}
  trimDone_${LABEL}:
    StrCmp $1 "" loop_${LABEL}
    RMDir /r "$1"
    Goto loop_${LABEL}
  close_${LABEL}:
    FileClose $0
  done_${LABEL}:
!macroend

!macro customUnInstall
  ; Clean Electron userData and legacy app data folders on explicit uninstall.
  ; Upgrade/overwrite install runs the old uninstaller with isUpdated=true, so guard it.
  ${ifNot} ${isUpdated}
    SetShellVarContext current
    !insertmacro cleanExternalDataRoots "$APPDATA\东风奕境AI工作台\uninstall-data-roots.txt" newProductName
    !insertmacro cleanExternalDataRoots "$APPDATA\唯变AI工作台\uninstall-data-roots.txt" productName
    !insertmacro cleanExternalDataRoots "$APPDATA\shuzhi-yinxiang\uninstall-data-roots.txt" packageName
    !insertmacro cleanExternalDataRoots "$APPDATA\ShuzhiYinxiang\uninstall-data-roots.txt" appId
    RMDir /r "$APPDATA\东风奕境AI工作台"
    RMDir /r "$APPDATA\唯变AI工作台"
    RMDir /r "$APPDATA\shuzhi-yinxiang"
    RMDir /r "$APPDATA\ShuzhiYinxiang"
    RMDir /r "$APPDATA\东风奕境AI工作台-updater"
    RMDir /r "$APPDATA\唯变AI工作台-updater"
    RMDir /r "$APPDATA\shuzhi-yinxiang-updater"
    RMDir /r "$APPDATA\ShuzhiYinxiang-updater"
    RMDir /r "$LOCALAPPDATA\东风奕境AI工作台"
    RMDir /r "$LOCALAPPDATA\唯变AI工作台"
    RMDir /r "$LOCALAPPDATA\shuzhi-yinxiang"
    RMDir /r "$LOCALAPPDATA\ShuzhiYinxiang"
    RMDir /r "$LOCALAPPDATA\东风奕境AI工作台-updater"
    RMDir /r "$LOCALAPPDATA\唯变AI工作台-updater"
    RMDir /r "$LOCALAPPDATA\shuzhi-yinxiang-updater"
    RMDir /r "$LOCALAPPDATA\ShuzhiYinxiang-updater"
    RMDir /r "$TEMP\aigcpanel-watermark-logs"
    RMDir /r "$INSTDIR"
  ${endif}
!macroend
