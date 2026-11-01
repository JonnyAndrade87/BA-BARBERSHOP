@echo off
title JOWTV - Liberar no Firewall
:: Libera a porta 8080 do JOWTV no Firewall do Windows para o celular/TV conseguirem acessar.
:: Precisa de permissao de administrador (o Windows vai perguntar).

net session >nul 2>&1
if errorlevel 1 (
  echo Pedindo permissao de administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

netsh advfirewall firewall delete rule name="JOWTV" >nul 2>&1
netsh advfirewall firewall add rule name="JOWTV" dir=in action=allow protocol=TCP localport=8080 profile=private,public >nul
if errorlevel 1 (
  echo.
  echo  Nao foi possivel criar a regra no firewall.
  echo.
  pause
  exit /b 1
)

echo.
echo  Pronto! O JOWTV (porta 8080) foi liberado no Firewall do Windows.
echo  Agora feche a janela do JOWTV, abra o iniciar.bat de novo e tente no celular.
echo.
echo  Para desfazer depois, rode como administrador:
echo    netsh advfirewall firewall delete rule name="JOWTV"
echo.
pause
