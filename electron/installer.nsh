; Заменяет стандартный CHECK_APP_RUNNING для автообновления:
; полное дерево процессов Electron (несколько FuelAccounting.exe) надёжнее гасится через /F /T.
!macro customCheckAppRunning
  DetailPrint "Closing running ${PRODUCT_NAME} (full process tree)…"
  nsExec::ExecToLog 'cmd.exe /c taskkill /F /T /IM "${PRODUCT_FILENAME}.exe"'
  Sleep 2000
!macroend
