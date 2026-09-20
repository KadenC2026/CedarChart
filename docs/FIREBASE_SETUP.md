# cedar account setup

cedar uses Firebase Authentication for Google sign-in and passwordless `@mit.edu`
email links. Cloud state is stored in one private Firestore document per Firebase
user and protected by `firestore.rules`.

## Create the Firebase project

1. Create or select a Firebase project and add a **Web app**.
2. In **Authentication → Sign-in method**, enable **Google** and
   **Email/Password**. Under Email/Password, enable **Email link (passwordless
   sign-in)**.
3. In **Authentication → Settings → Authorized domains**, add
   `cedar-chart.vercel.app` and any custom production domain. Firebase includes
   `localhost` for local development.
4. Create a Cloud Firestore database. Do not use open test rules.
5. Deploy the checked-in rules with `firebase deploy --only firestore:rules`, or
   paste `firestore.rules` into the Firebase console and publish them.

## Configure Vercel

Copy the Web app's Firebase configuration values into these Vercel environment
variables for Production, Preview, and Development:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID
```

These Firebase web configuration values are designed to be public. Access is
controlled by Firebase Authentication and the Firestore rules. Do not add a
Firebase Admin service-account key to the browser app.

Redeploy cedar after adding the variables. Confirm all three paths:

1. Continue with Google, reload, and sign out.
2. Request a link for an `@mit.edu` address and open it in the same browser.
3. Change the plan while signed in, reload on another browser, and confirm the
   account state is restored without changing the signed-out local plan.
