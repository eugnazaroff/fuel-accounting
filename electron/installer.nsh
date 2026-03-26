; Принудительное закрытие дерева процессов Electron перед установкой / обновлением.
!macro KillFuelAccountingAll
  DetailPrint "KillFuelAccountingAll: ${PRODUCT_FILENAME}.exe"
  nsExec::ExecToLog 'cmd.exe /c taskkill /F /T /IM "${PRODUCT_FILENAME}.exe"'
  Sleep 1000
  nsExec::ExecToLog 'cmd.exe /c taskkill /F /T /IM "${PRODUCT_FILENAME}.exe"'
  Sleep 2500
!macroend

!macro preInit
  !insertmacro KillFuelAccountingAll
!macroend

!macro customInit
  !insertmacro KillFuelAccountingAll
!macroend

!macro customCheckAppRunning
  !insertmacro KillFuelAccountingAll
!macroend
