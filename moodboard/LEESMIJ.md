# Moodboard-afbeeldingen

Hier komen de afbeeldingen voor het moodboard (bij de eerste start en via Instellingen → Jouw stijl).
Zolang hier niets staat, kiest de gebruiker uit stijl-tegels.

## Afspraken
- Per stijl **3 afbeeldingen**, aparte sets voor **man** en **vrouw** (24 per set).
- Staand formaat **3:4**, bijvoorbeeld **900 × 1200 pixels**, **JPG**.
- Bestandsnaam: `stijl-nummer.jpg`, bijvoorbeeld `street-1.jpg`.
- Mapjes: `moodboard/man/` en `moodboard/vrouw/`.

## Stijlen (gebruik precies deze namen)
| Naam in bestand | Stijl |
|---|---|
| `clean` | Clean / minimal |
| `street` | Streetwear |
| `oldmoney` | Old money / klassiek |
| `sporty` | Sporty |
| `vintage` | Vintage |
| `y2k` | Y2K |
| `edgy` | Edgy / stoer |
| `kleurrijk` | Kleurrijk |

## Lijst bijwerken
Zet elke afbeelding ook in `index.json`, zo:

```json
{
  "man": [
    { "file": "man/street-1.jpg", "style": "street" },
    { "file": "man/clean-1.jpg", "style": "clean" }
  ],
  "vrouw": [
    { "file": "vrouw/y2k-1.jpg", "style": "y2k" }
  ]
}
```

Of vraag Claude om de lijst te maken zodra de afbeeldingen in de mapjes staan.
