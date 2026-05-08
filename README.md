# PlungeTX Website

## 🚀 Deploy to GitHub Pages (Step-by-Step)

### Step 1 — Set up Formspree (booking form emails)
1. Go to **formspree.io** and sign up free
2. Click "New Form" → name it "PlungeTX Bookings"
3. Set the email to: `blambinvestmentsllc@gmail.com`
4. Copy your Form ID (looks like: `xpwzabcd`)
5. Open `index.html`, find this line near the form:
   ```
   action="https://formspree.io/f/YOUR_FORM_ID"
   ```
   Replace `YOUR_FORM_ID` with your actual ID.

### Step 2 — Upload to GitHub
1. Go to **github.com** and sign in (or create free account)
2. Click **"New repository"**
3. Name it exactly: `plungetx.com` (or any name you like)
4. Set to **Public**
5. Click **"Create repository"**
6. Drag both files (`index.html` and `CNAME`) into the repository page
7. Click **"Commit changes"**

### Step 3 — Enable GitHub Pages
1. In your repo, click **Settings**
2. Scroll to **"Pages"** in the left sidebar
3. Under "Source" → select **"Deploy from a branch"**
4. Branch: **main** / Folder: **/ (root)**
5. Click **Save**
6. GitHub will show you a URL like `yourusername.github.io/reponame`

### Step 4 — Point your domain (DNS)
Log into wherever you bought `plungetx.com` (GoDaddy, Namecheap, Google Domains, etc.) and add these DNS records:

**Delete any existing A records for @, then add:**
| Type | Host | Value |
|------|------|-------|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | yourusername.github.io |

DNS can take 10 minutes to 48 hours to fully propagate.

### Step 5 — Verify custom domain in GitHub
1. Go back to **Settings → Pages**
2. Under "Custom domain", type `plungetx.com`
3. Click Save
4. Check "Enforce HTTPS" once it becomes available (free SSL!)

---
That's it — your site will be live at plungetx.com 🎉
