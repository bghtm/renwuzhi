# Export PPTX slides to PNG using PowerPoint COM automation.
# Output: .build/slides/<key>/slide-01.png ...
#
#   pwsh tools/export-slides.ps1                       # 全部已知的 deck
#   pwsh tools/export-slides.ps1 -Pptx C:\a.pptx -Key ep12   # 只导一份（新增一期用）
param(
  [string]$Src = "C:\Users\31996\OneDrive\文档\PrAe\跨圈人物志极速版",
  [string]$Out = "D:\code\web\kuake-renwuzhi\.build\slides",
  [int]$Width = 1920,
  [int]$Height = 1080,
  [string]$Pptx = "",
  [string]$Key = ""
)

$decks = [ordered]@{
  'ep01'          = '跨圈人物志极速版（1）.pptx'
  'ep02'          = '跨圈人物志极速版（2）.pptx'
  'ep03'          = '跨圈人物志极速版（3）.pptx'
  'ep04'          = '跨圈人物志极速版（4）.pptx'
  'ep05'          = '跨圈人物志极速版（5）.pptx'
  'ep06'          = '跨圈人物志极速版（6）.pptx'
  'ep07'          = '跨圈人物志极速版（7）.pptx'
  'ep08'          = '跨圈人物志极速版（8）.pptx'
  'ep09'          = '跨圈人物志极速版（9）.pptx'
  'ep10'          = '跨圈人物志极速版（10）.pptx'
  'ep11'          = '跨圈人物志极速版（11）.pptx'
  'ep01b'         = '跨圈人物志极速版（1） 补充.pptx'
  'od01'          = '药圈人物志极速版（1）.pptx'
  'extra-labor'   = '劳保跨与自恨跨_单页介绍.pptx'
  'extra-trans'   = '上集补充_蓝粉白过渡页.pptx'
  'extra-template'= '跨圈人物志_蓝粉白鱼板风格模板.pptx'
}

# single-deck mode: -Pptx + -Key
if ($Pptx) {
  if (-not $Key) { $Key = [System.IO.Path]::GetFileNameWithoutExtension($Pptx) }
  $decks = [ordered]@{ $Key = $Pptx }
  $Src = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($Pptx))
  $decks[$Key] = [System.IO.Path]::GetFileName($Pptx)
}

New-Item -ItemType Directory -Force -Path $Out | Out-Null

$ppt = New-Object -ComObject PowerPoint.Application
$summary = @()
try {
  foreach ($key in $decks.Keys) {
    $file = Join-Path $Src $decks[$key]
    if (-not (Test-Path -LiteralPath $file)) { $summary += "MISSING $key"; continue }
    $tmp = Join-Path $Out "raw-$key"
    $dst = Join-Path $Out $key
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
    if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null

    $pres = $ppt.Presentations.Open($file, -1, 0, 0)
    $count = $pres.Slides.Count
    $pres.Export($tmp, "PNG", $Width, $Height)
    for ($i = 0; $i -lt 30; $i++) {
      Start-Sleep -Milliseconds 200
      if ((Get-ChildItem -LiteralPath $tmp -File -ErrorAction SilentlyContinue).Count -ge $count) { break }
    }
    $pres.Close()

    New-Item -ItemType Directory -Force -Path $dst | Out-Null
    $pngs = Get-ChildItem -LiteralPath $tmp -File | Where-Object { $_.Extension -match 'png' } |
      Sort-Object { [int]([regex]::Match($_.BaseName, '\d+').Value) }
    $n = 0
    foreach ($p in $pngs) {
      $n++
      Copy-Item -LiteralPath $p.FullName -Destination (Join-Path $dst ("slide-{0:d2}.png" -f $n)) -Force
    }
    Remove-Item -LiteralPath $tmp -Recurse -Force
    $summary += "{0,-15} slides={1} exported={2}" -f $key, $count, $n
  }
} catch {
  $summary += "ERROR: $($_.Exception.Message)"
} finally {
  try { $ppt.Quit() } catch {}
  try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) } catch {}
  [GC]::Collect()
}
$summary | ForEach-Object { Write-Output $_ }
Write-Output "DONE"
