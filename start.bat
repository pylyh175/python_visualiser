@echo off
rem Starts the Python Code Visualiser.
rem Browsers refuse to read runner.py from file:// pages, so this helper
rem serves the folder on a tiny local web server and opens your browser.
cd /d "%~dp0"
start "code_visualiser server" /min cmd /c "python -m http.server 8765"
timeout /t 1 >nul
start "" "http://127.0.0.1:8765/index.html"
echo Server running in the tray (close the "code_visualiser server" window to stop it).
echo If the page shows an error, the server window may have closed - run me again.
