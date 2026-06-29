# Windows folder picker (run with: powershell -STA -File pick-folder.ps1)
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$dlg = New-Object System.Windows.Forms.FolderBrowserDialog
$dlg.Description = 'Select project folder'
$dlg.ShowNewFolderButton = $true
$result = $dlg.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Out.Write($dlg.SelectedPath)
}