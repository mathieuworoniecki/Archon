# Archon - TODO

## ✅ Terminé

- Phase 4: Navigation Multi-Pages
- Phase 5: Extraction Archives
- Phase 6: Timeline Interactive (+ page dédiée)
- Phase 7: NER + Entités
- Phase 8: Interface Cockpit
- Phase 9: Chaîne de Preuve (MD5/SHA256 + Audit Log)
- Phase 10: Chat IA (RAG + Gemini)
- Phase 11: Système de Projets (API /api/projects)
- Scalabilité 100k+ documents
- Audit UI ✓ - Toutes les pages accessibles

---

## 🔜 Prochaines Améliorations

### UI Projets (Phase 11.2)

- [ ] Sélecteur de projet sur page d'accueil
- [ ] Filtrage des scans par projet
- [ ] Stats isolées par projet

### Améliorations UX

- [ ] Modal détail scan avancé
- [ ] Export PDF des rapports
- [ ] Thème clair/sombre toggle

---

## ⚠️ Configuration Requise

### Clé Gemini pour Chat IA

```bash
export GEMINI_API_KEY="clé_gemini"
```

### Dossier Documents

```bash
export DOCUMENTS_PATH="/chemin/vers/documents"
# Ou utiliser ./documents par défaut
```

### Lancer

```bash
docker compose -f docker-compose.prod.yaml up -d
```

---

## Accès

- **App**: http://localhost:3100
- **Monitoring**: http://localhost:5555
