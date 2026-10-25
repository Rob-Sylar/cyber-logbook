# Cyber Logbook

A free, offline-first learning journal for teaching yourself cyber security. Use it for TryHackMe, OverTheWire Bandit, picoGym, Hack The Box, CyberDefenders, Blue Team Labs and your own homelab.

- **Log a session:** time, platform, room, tags, what you did, what you learned, commands, open questions and confidence. The **Explain it to a mate** box is the star of the form. Drafts save as you type, and there's a quick-log mode.
- **Journal:** search and filters. **Cheat sheet:** every command you've logged, with one-tap copy. **Questions:** everything you're still confused about. **Review:** flashcards, lowest confidence first. **Stats:** weekly goal, streaks and a 12-week heatmap.
- **Your data stays with you.** It's stored on each device in IndexedDB and works with no internet. Sync between your PC and phone is free, through a secret GitHub Gist on your own account.
- **Export:** Markdown for Obsidian (zip) and full JSON backups. Import merges by entry and never wipes newer work.

Everything is free: plain HTML/CSS/JavaScript, no build step, no server, hosted on GitHub Pages. The only library is [JSZip](https://stuk.github.io/jszip/) (MIT), included in `vendor/`.

---

## 1. Run it on your PC (optional)

Double-click **`run-local.cmd`**. It starts a tiny web server built into Windows and opens <http://localhost:8080/>. Close the black window to stop it.

> Opening `index.html` directly (as a `file://` page) won't work, because browsers only allow offline mode and modules on a real web address.

## 2. Put it online with GitHub Pages (free, about 10 minutes)

You only need a web browser. These steps use GitHub's website, so you don't need to install anything.

**a) Make a GitHub account**
1. Go to <https://github.com/signup> and sign up with your email. Pick a username. It becomes part of your app's address, e.g. `yourname.github.io`.
2. Verify your email when GitHub asks.

**b) Create the repository (the project's home)**
1. Click **+** (top right) → **New repository**.
2. Repository name: `cyber-logbook`
3. Choose **Public**. GitHub Pages is free for public repos. Only the app's code goes here, **never your journal**.
4. Leave "Add a README" **unticked**. Click **Create repository**.

**c) Upload the files**
1. On the new, empty repository page, click the link **uploading an existing file**.
2. In File Explorer, open this `Cyber-logbook` folder, press **Ctrl+A** to select everything, and drag it all onto the GitHub page. Folders keep their structure.
   - Don't upload any backup or export files (`cyber-logbook-backup-….json`, `.zip`) if you saved them in this folder. They contain your notes.
3. Wait until every file shows in the list, then click **Commit changes** at the bottom.

**d) Turn on GitHub Pages**
1. In the repository, click **Settings** (top) → **Pages** (left menu).
2. Under **Build and deployment** → **Source**, choose **Deploy from a branch**.
3. Branch: **main**, folder: **/ (root)** → **Save**.
4. Wait 1–2 minutes and refresh the page. It shows **"Your site is live at https://YOUR-USERNAME.github.io/cyber-logbook/"**. That's your app's address. Bookmark it.

**Updating the app later**
Change the files, then open `sw.js` and bump `const VERSION = '1.0.0'` (for example to `'1.0.1'`). Upload the changed files the same way (**Add file → Upload files**) and commit. Installed copies show **"A new version is ready → Reload"** the next time they open.

<details>
<summary>Prefer the command line? (optional, needs <a href="https://git-scm.com/download/win">Git for Windows</a>)</summary>

```bash
git init
```
```bash
git add .
```
```bash
git commit -m "Cyber Logbook"
```
```bash
git branch -M main
```
```bash
git remote add origin https://github.com/YOUR-USERNAME/cyber-logbook.git
```
```bash
git push -u origin main
```
Then do step **d** above.
</details>

## 3. Install it as an app

The app has a built-in **Install app** screen that detects your browser and shows these steps.

### Windows PC: use Microsoft Edge (already on Windows 11)

Opera GX can't install web apps on a PC. Cyber Logbook still works fine in an Opera GX tab, but to get a proper app window and Start-menu icon, install it with Edge:

1. Open your app address in **Microsoft Edge**. From Opera GX: open the app, go to **Install app**, and click **Open in Edge**.
2. Click the **App available** icon at the right of the address bar (a square with a plus), then **Install**. Or use the **⋯** menu → **Apps** → **Install Cyber Logbook**.
3. To pin it: right-click its taskbar icon → **Pin to taskbar**.

> Opera GX and the installed Edge app each keep **their own copy** of your data. Either use the installed app only, or turn on Sync in both.

### Android phone: Chrome

1. Open your app address in **Chrome**.
2. Tap **⋮** (top right) → **Install app**. On some versions it's **Add to Home screen** → **Install**.
3. Confirm. The icon appears on your home screen and in your app drawer.

After installing, the app opens and works with **no internet**.

## 4. Set up sync between PC and phone (free)

Sync uses one JSON file in a **secret Gist** on your GitHub account. Each device merges by entry, and the newest edit wins. Deleting an entry on one device deletes it on the other.

**Make a token (do this once per device):**
1. Go to <https://github.com/settings/personal-access-tokens/new>. The long way: profile picture → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. **Token name:** `Cyber Logbook PC` (then `Cyber Logbook phone` for the second one). **Expiration:** 1 year. Put a reminder in your calendar to renew it.
3. **Repository access:** leave it on **Public repositories** (read-only). The app doesn't need any repository.
4. **Permissions → Account permissions → Gists → Read and write.** On the newer layout: **Add permissions** → tick **Gists** → **Read and write**. Leave everything else on **No access**.
5. Click **Generate token** and copy it. It starts with `github_pat_`, and GitHub only shows it once.

**Connect:**
1. **PC first:** open the app → **Settings → Sync** → paste the token → **Connect and sync**. A secret Gist called *Cyber Logbook sync data* is created.
2. **Then the phone:** same steps with the phone's token. It finds the same Gist and merges both devices.
3. From then on, the app syncs when it opens, when you switch back to it, and a couple of seconds after each save. The cloud icon at the top shows the last sync time; tap it to sync now.

**Good to know**
- The token is stored only on that device. It's never shown again, logged, exported or put in backups. To revoke it, delete it on the GitHub token page.
- "Secret" Gists are **unlisted, not encrypted**. Anyone with the exact Gist link could read it. Don't share the link, and never store real-life passwords in the app. Wargame flags are fine.
- If you edit the *same* entry on both devices before they sync, the later edit wins. Different entries are always kept.

## 5. Back up your data

Settings → **Backup and export**:
- **Export JSON backup:** everything, in one file. Keep a copy somewhere safe (OneDrive, Google Drive, a USB stick) every so often.
- **Import JSON backup:** restores a backup by merging. It adds missing entries and updates older ones, and never wipes newer work.
- **Export Markdown (.zip):** one `.md` per entry with YAML front-matter, commands as fenced code blocks, plus a cheat sheet and an index. Unzip it into your Obsidian vault. Flags are left out unless you tick the box.
- On Android, the share sheet opens if Chrome can share that file type. Chrome currently can't share `.zip`/`.json` files, so they go to your **Downloads** folder.

**Reset** (Settings → Reset) wipes this device after an on-page confirmation where you type `RESET`. It first downloads `cyber-logbook-before-reset-….json` automatically, and an **Undo reset** button appears straight after. It then asks separately whether to wipe the synced copy too. If you do, your other device will ask before removing or re-uploading anything.

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| "Can't open its storage" | You're probably in a private/incognito window, or site data is blocked. Use a normal window. |
| The app didn't update | Close and reopen it, then tap **Reload** on the "new version" message. Did you bump `VERSION` in `sw.js`? |
| Sync says the token was rejected | It expired or was deleted. Make a new one and paste it in Settings → Sync. |
| Sync says "not allowed to use Gists" | The token needs **Gists: Read and write**. |
| No "Install" option in Edge/Chrome | Make sure you're on the `https://…github.io/…` address (not `file://`), and wait a few seconds after it loads. |

## For the curious: the tests

The `tests/` folder has a Playwright test suite covering:
- every screen, on phone and desktop sizes up to 2560×1440, in light and dark;
- automated accessibility (axe) checks and tap-target sizes;
- installability and offline use;
- two separate browser profiles syncing through one (simulated) Gist;
- export/import, hostile import files and reset/undo.

It isn't needed to use the app. To run it you need [Node.js LTS](https://nodejs.org/):

```bash
cd tests
```
```bash
npm install
```
```bash
npx playwright install chromium
```
```bash
npx playwright test
```

Set `CL_BASE=/cyber-logbook/` to test from a sub-folder like GitHub Pages. Set `CL_BROWSER` to a browser's `.exe` (e.g. Opera GX's `opera.exe` or Edge's `msedge.exe`) to run the suite inside that browser.
