$docxPath = "C:\Users\Keyrus\OneDrive - Keyrus\Escritorio\antigravity test\DataLens_AI_Arquitectura_v3 (1).docx"
$zipPath = "C:\Users\Keyrus\OneDrive - Keyrus\Escritorio\antigravity test\temp_docx.zip"
$destPath = "C:\Users\Keyrus\OneDrive - Keyrus\Escritorio\antigravity test\extracted_docx"

Copy-Item -Path $docxPath -Destination $zipPath -Force

if (Test-Path $destPath) {
    Remove-Item -Recurse -Force $destPath
}

Expand-Archive -Path $zipPath -DestinationPath $destPath -Force

[xml]$xml = Get-Content "$destPath\word\document.xml" -Raw

$ns = @{ w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main" }

$nodes = Select-Xml -Xml $xml -XPath "//w:p" -Namespace $ns

foreach ($node in $nodes) {
    $texts = Select-Xml -Xml $node.Node -XPath ".//w:t" -Namespace $ns | ForEach-Object { $_.Node.InnerText }
    if ($texts) {
        $texts -join ""
    }
}
