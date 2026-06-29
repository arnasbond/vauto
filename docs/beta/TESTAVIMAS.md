# VAUTO beta testavimas (Feature Freeze v1.6.3)

## Versija

- **Web / API:** 1.6.4 (versionCode 50)
- **APK:** https://github.com/arnasbond/vauto/releases/download/android-latest/vauto.apk
- **API health:** https://vauto-api.onrender.com/api/version

## Bug report

GitHub → Issues → **Beta bug report**: https://github.com/arnasbond/vauto/issues/new?template=beta-bug-report.yml

## Testuotojų žinutės (copy-paste)

- **Privatus profilis (Vinted):** `docs/beta/jolanta-zinute.txt`
- **Verslo profilis (Skelbiu/Autoplius):** `docs/beta/verslas-zinute.txt`

## Checklist (trumpai)

### Visiems

- [ ] Įdiegti 1.6.4 (50)
- [ ] SMS prisijungimas
- [ ] Pasirinkti profilio tipą (vienkartinis)

### Privatus (`private`)

- [ ] Tab „Mano spinta“, Vinted/Depop portalais viršuje
- [ ] Vinted profilio importas + sync accordion
- [ ] AI derybos — mandagus tonas
- [ ] Nuotraukos kraunasi

### Verslas (`business`)

- [ ] Tab „Skelbimai“, LT portalai viršuje
- [ ] Skelbiu/Autoplius importas
- [ ] AI derybos — profesionalus B2B tonas

### Serverio logai (komandai)

Render → `vauto-api` → Logs. Filtruoti: `[VAUTO:sms]`, `[VAUTO:image-proxy]`, `[VAUTO:portal-import]`, `[VAUTO:portal-sync]`, `[VAUTO:negotiation-twin]`.
