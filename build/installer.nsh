!macro customUnInstall
  ${ifNot} ${isUpdated}
    ${if} $installMode == "all"
      SetShellVarContext current
    ${endif}
    RMDir /r "$APPDATA\Gacha Manager\assets"
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
  ${endIf}
!macroend
