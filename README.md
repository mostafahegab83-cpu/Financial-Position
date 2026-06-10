# My Finance — Static App

Simple 3-page app to track your financial position. Pure HTML / CSS / JS — no build step. Data is saved in your browser via `localStorage`.

## Pages
1. **index.html** — Financial Position = Total Income − Total Debts. Add/undo/clear amounts.
2. **expenses.html** — Set a cycle start & end date, add expenses (name + amount + date), see total paid in the cycle.
3. **summary.html** — Combined overview.

## Run locally
Just open `index.html` in your browser, or use a static server:

```bash
python3 -m http.server 8000
```

## Deploy on GitHub Pages
1. Create a new GitHub repo and push these files.
2. Repo → **Settings → Pages** → Source: `main` branch / root.
3. Visit `https://<your-username>.github.io/<repo-name>/`.

## Files
- `index.html`, `expenses.html`, `summary.html`
- `styles.css`
- `app.js`
