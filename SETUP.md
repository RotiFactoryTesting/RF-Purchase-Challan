# RF Purchase Challan — Setup Guide

This app is 4 plain files (`index.html`, `styles.css`, `app.js`, `firebase-config.js`) plus
`firestore.rules`. No build step, no npm install — it runs straight in the browser.

## 1. Create the Firebase project (~5 minutes)

1. Go to https://console.firebase.google.com and click **Add project**.
   Give it any name, e.g. "rf-purchase-challan".
2. Once created, click the **Web** icon (`</>`) to register a web app.
   Skip "Firebase Hosting" for now — you can host on GitHub Pages like RF Forms.
3. Firebase will show you a `firebaseConfig` object. Copy those values into
   `firebase-config.js` in this folder, replacing the `PASTE_YOUR_...` placeholders.

## 2. Turn on Authentication

1. In the Firebase console: **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Email/Password**.

## 3. Turn on Firestore (the database)

1. **Build → Firestore Database → Create database**.
2. Choose **Start in production mode** (not test mode).
3. Pick the region closest to you (e.g. `asia-south1` for India) and click Enable.
4. Go to the **Rules** tab, delete what's there, and paste in the entire
   contents of `firestore.rules` from this folder. Click **Publish**.

## 4. Create your first Admin account

The app has no public sign-up — an Admin adds every user from inside the app.
For the very first Admin, you create the account by hand once:

1. In the Firebase console: **Authentication → Users → Add user**.
   Enter your email and a password.
2. **Firestore Database → Start collection** → collection ID: `users`.
3. For the Document ID, paste the **User UID** shown next to the user you just
   created in the Authentication tab.
4. Add these fields to that document:
   - `name` (string) — your name
   - `email` (string) — same email you used
   - `role` (string) — `admin`
   - `active` (boolean) — `true`
5. Save.

You can now log into the app with that email/password, and use
**Manage Users** inside the app to add everyone else (staff, managers,
purchase people, and additional admins) — no more manual console work needed.

## 5. Add your regular items (optional but recommended)

Inside the app, once logged in as Admin: **Manage Items** → add the items your
factory orders regularly (oil, packaging, gas cylinders, etc.). These show up
as a dropdown when staff raise a new requisition — they can still type a
one-off item manually if it's not in the list.

## 6. Deploy it

Same approach as your RF Forms app:

```bash
git init
git add .
git commit -m "RF Purchase Challan app"
git remote add origin <your empty GitHub repo URL>
git push -u origin main
```

Then in the GitHub repo: **Settings → Pages → Deploy from branch → main / (root)**.
Your app will be live at `https://<your-github-username>.github.io/<repo-name>/`.

## How it works day to day

- **Staff** raises a new requisition → gets an auto Challan No. (RF-1001, RF-1002…) →
  status starts as **Pending Approval**.
- **Manager** opens it from the dashboard, reviews items, and Approves or Rejects.
- Once **Approved**, it's visible to **Purchase** staff, who fill in vendor,
  bill number, and amount paid, and mark it **Purchased**.
- Anyone can open a requisition at any stage and hit **Print / Download PDF**
  to get a copy laid out like the original paper challan (bilingual
  English/Hindi), for filing or handing to a vendor.
- The **Dashboard** shows every requisition with filters for each status, so
  nothing sits waiting without anyone noticing.

## Notes

- The **Manage Users** admin screen creates real login accounts — give people
  their email + temporary password and ask them to keep it safe. There's no
  "forgot password" flow built in yet; if someone's locked out, reset their
  password from Firebase console → Authentication → Users.
- Firebase's free (Spark) tier comfortably covers a single small factory's
  daily use of this app — same as RF Forms.
