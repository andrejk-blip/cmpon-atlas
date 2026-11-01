#!/usr/bin/env python3
"""Derive the standalone entry from the release's exact ordered engine assets."""
from pathlib import Path
import re
root=Path(__file__).resolve().parent.parent
s=(root/'index.html').read_text()
s=s.replace('<body>','<body class="citadel-webapp">')
s=re.sub(r'<title>.*?</title>','<title>Цитадель ЦСИИ — игра</title>',s)
s=re.sub(r'<link rel="canonical"[^>]+>','<link rel="canonical" href="https://andrejk-blip.github.io/cmpon-atlas/play.html">',s)
s=re.sub(r'<meta (?:property="og:[^"]+"|name="twitter:[^"]+")[^>]+>\n?','',s)
s=re.sub(r'(<meta name="description" content=")[^"]+',r'\g<1>15 глав космического приключения: полёты, живые монстры, базы и решения аналитика.',s)
s=re.sub(r'<link rel="icon"[^>]+>','<link rel="icon" href="./assets/citadel-icon.svg" type="image/svg+xml">',s)
s=s.replace('./assets/citadel-icon-192.png','./assets/citadel-icon-180.png')
s=re.sub(r'<(?:script defer src|link rel="stylesheet" href)="\./assets/atlas-(?:metrics|integration)[^>]+>(?:</script>)?\n?','',s)
s=s.replace('</head>','<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n<link rel="stylesheet" href="./assets/citadel-webapp-v2.12.0.css?build=2130r1">\n<script>if(!location.hash)history.replaceState(null,"","#arcade");</script>\n</head>')
s=s.replace('</body>','<script defer src="./assets/citadel-webapp-v2.12.0.js?build=2130r1"></script>\n</body>')
(root/'play.html').write_text(s)
print('Built standalone play.html with shared engine assets.')
