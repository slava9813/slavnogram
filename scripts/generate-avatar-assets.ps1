Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "apps\web\public\avatar\accessories"
New-Item -ItemType Directory -Force -Path $out | Out-Null

$w = 1254
$h = 1254

function Save-Canvas($name, [scriptblock]$draw) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  & $draw $g
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

Save-Canvas "nose-clown.png" {
  param($g)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.RectangleF]::new(350, 650, 115, 92)), ([System.Drawing.Color]::FromArgb(245, 255, 55, 94)), ([System.Drawing.Color]::FromArgb(210, 130, 0, 35)), 35
  $g.FillEllipse($brush, 342, 646, 128, 96)
  $shine = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(120, 255, 255, 255))
  $g.FillEllipse($shine, 382, 664, 28, 18)
}

Save-Canvas "glasses-neon.png" {
  param($g)
  $cyan = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(235, 59, 243, 255)), 15
  $pink = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(220, 255, 79, 216)), 8
  $bridge = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(235, 101, 255, 180)), 11
  $g.DrawEllipse($cyan, 212, 510, 190, 112)
  $g.DrawEllipse($cyan, 486, 438, 178, 104)
  $g.DrawEllipse($pink, 225, 522, 164, 88)
  $g.DrawEllipse($pink, 498, 450, 152, 80)
  $g.DrawLine($bridge, 398, 553, 488, 506)
  $g.DrawLine($bridge, 650, 489, 724, 470)
}

Save-Canvas "glasses-sun.png" {
  param($g)
  $frame = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(240, 255, 209, 102)), 14
  $lens = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(115, 10, 14, 24))
  $g.FillEllipse($lens, 215, 515, 182, 104)
  $g.FillEllipse($lens, 490, 443, 170, 96)
  $g.DrawEllipse($frame, 215, 515, 182, 104)
  $g.DrawEllipse($frame, 490, 443, 170, 96)
  $g.DrawLine($frame, 396, 556, 489, 507)
  $g.DrawLine($frame, 657, 488, 726, 466)
}

Save-Canvas "hat-crown.png" {
  param($g)
  $gold = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(230, 255, 209, 102))
  $edge = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(245, 255, 246, 170)), 8
  $pts = @(
    [System.Drawing.Point]::new(260, 230),
    [System.Drawing.Point]::new(330, 92),
    [System.Drawing.Point]::new(430, 210),
    [System.Drawing.Point]::new(520, 68),
    [System.Drawing.Point]::new(620, 205),
    [System.Drawing.Point]::new(730, 88),
    [System.Drawing.Point]::new(780, 245),
    [System.Drawing.Point]::new(300, 308)
  )
  $g.FillPolygon($gold, $pts)
  $g.DrawPolygon($edge, $pts)
  $gem = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(230, 255, 79, 216))
  $g.FillEllipse($gem, 500, 180, 46, 46)
  $g.FillEllipse($gem, 642, 177, 38, 38)
}

Save-Canvas "hat-cap.png" {
  param($g)
  $cap = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(235, 25, 34, 50))
  $brim = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(230, 59, 243, 255))
  $line = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(240, 101, 255, 180)), 8
  $g.FillPie($cap, 230, 78, 570, 300, 188, 165)
  $g.FillEllipse($brim, 512, 224, 360, 76)
  $g.DrawArc($line, 230, 78, 570, 300, 188, 165)
  $g.DrawLine($line, 310, 250, 790, 238)
}

Save-Canvas "wig-cyber.png" {
  param($g)
  $hair = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(150, 59, 243, 255))
  $line = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(220, 255, 79, 216)), 10
  $g.FillPie($hair, 165, 58, 690, 328, 178, 178)
  for ($i = 0; $i -lt 9; $i++) {
    $x = 210 + ($i * 58)
    $g.DrawCurve($line, @(
      [System.Drawing.Point]::new($x, 210),
      [System.Drawing.Point]::new($x + 25, 270),
      [System.Drawing.Point]::new($x + 5, 340)
    ))
  }
}

Save-Canvas "wig-pink.png" {
  param($g)
  $hair = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(155, 255, 79, 216))
  $strand = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(230, 255, 180, 236)), 13
  $g.FillPie($hair, 145, 42, 730, 360, 178, 185)
  for ($i = 0; $i -lt 11; $i++) {
    $x = 190 + ($i * 54)
    $g.DrawCurve($strand, @(
      [System.Drawing.Point]::new($x, 185),
      [System.Drawing.Point]::new($x + 42, 245),
      [System.Drawing.Point]::new($x + 8, 326)
    ))
  }
}
