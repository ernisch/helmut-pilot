# Helmut — App-Symbol (Richtung 1a)

Das Zeichen aus Richtung 1a als App-Symbol: Spectral-H (Medium) auf heller Fläche.
Das H liegt als Pfad vor — keine Schriftabhängigkeit. Proportion wie im Zeichen:
Schriftgröße 100/140 der Kantenlänge, Versalhöhe ≈ 47 %, optisch zentriert.

Farben: Fläche #EDEFF4 · Tinte #0A0F1C · Dunkel invertiert · Getönt/Monochrom weiß.

## zeichen/
- helmut-zeichen.svg — das Zeichen (Radius 28 %), hell
- helmut-zeichen-invers.svg — dunkles Quadrat, helles H (für hellen Grund)
- helmut-h.svg — nur das H als Pfad

## ios/  (Xcode: AppIcon, „Single Size“ 1024 px)
- AppIcon-1024.png — Any/Light
- AppIcon-1024-dark.png — Dark
- AppIcon-1024-tinted.png — Tinted (Graustufen, transparenter Grund)
- AppIcon-master*.svg — Quelldateien

## android/  (Adaptive Icon, 108 dp; H innerhalb der 66-dp-Zone)
- drawable/ic_launcher_foreground.xml, ic_launcher_background.xml, ic_launcher_monochrome.xml
- mipmap-anydpi-v26/ic_launcher.xml, ic_launcher_round.xml
- play-store-512.png — Store-Eintrag

## web/  (PWA & Favicon)
- icon-192.png, icon-512.png — purpose "any" (abgerundet, transparent)
- icon-512-maskable.png — purpose "maskable" (vollflächig; H in der 80 %-Sicherheitszone)
- apple-touch-icon.png — 180 px
- favicon.svg — kehrt sich mit prefers-color-scheme um (hell: dunkles Quadrat; dunkel: helles Quadrat)
- favicon-32.png, favicon-16.png — Fallback
- manifest-icons.json — Ausschnitt für manifest.webmanifest

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```
