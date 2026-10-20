/**
 * The English deck, and the shape every other deck fills in (`types.ts`).
 *
 * Keyed the way `steps.ts` is: questions by key, options by value, statement steps by id.
 * `{name}` is filled in at render; `[brackets]` is the accent in a headline.
 *
 * Every line here is a placeholder for the product's own words, written from the intake's pain
 * sentence. The structure is the part to keep.
 */
export const en = {
  meta: {
    title: "Appname: one line on what it fixes",
    description: "One sentence on the outcome. Subscribe, then sign in on the app.",
  },

  chrome: {
    continue: "Continue",
    letsGo: "Let's go",
    intro: "A few questions · about a minute",
    back: "Back",
    progress: "Progress",
  },

  openers: {
    headline: "Does [the problem] eat your time every week?",
    yes: "Yes",
    no: "Not really",
  },

  questions: {
    problem: {
      headline: "Which of these is [costing you] right now?",
      options: {
        time: "It takes too long",
        money: "It costs too much",
        stress: "It stresses me out",
        progress: "I can't see any progress",
      },
      recap: {
        time: "Hours a week going into the problem.",
        money: "Money leaking out every month.",
        stress: "A worry that follows you home.",
        progress: "Effort with nothing to show for it.",
      },
    },
    often: {
      headline: "How often does it happen?",
      options: {
        daily: "Every day",
        weekly: "Every week",
        monthly: "Every month",
        rarely: "Rarely",
      },
      recap: {
        daily: "It happens every single day.",
        weekly: "It comes back every week.",
        monthly: "It catches you out every month.",
      },
    },
    tried: {
      headline: "What have you tried so far?",
      options: {
        notes: "Notes and lists",
        apps: "Other apps",
        willpower: "Willpower",
        nothing: "Nothing yet",
      },
      recap: {
        notes: "Lists that were right the day you wrote them.",
        apps: "Apps that wanted more than they gave.",
        willpower: "Willpower, which runs out by the evening.",
      },
    },
    goal: {
      headline: "What would change things the most?",
      description: "Choose all that apply",
      options: {
        calm: "Feeling calm about it",
        time: "Getting my time back",
        control: "Feeling in control",
        proud: "Being proud of the result",
      },
    },
    soon: {
      headline: "How soon do you want this fixed?",
      options: {
        now: "Right now",
        month: "This month",
        exploring: "Just exploring",
      },
      recap: {
        now: "Ready to fix it today.",
        month: "Ready to fix it this month.",
      },
    },
  },

  steps: {
    why: {
      headline: "It's not you. [The method] is broken.",
      body: "Say what the usual way gets wrong, so the reader stops blaming themselves.",
      variants: {
        money: {
          headline: "It's not you. [The cost] is hidden.",
          body: "Say where the money goes without anyone noticing.",
        },
        stress: {
          headline: "It's not you. [Nobody] should carry this in their head.",
          body: "Say why the worry never switches off.",
        },
        progress: {
          headline: "It's not you. [Nothing] shows you the progress.",
          body: "Say why the effort stays invisible.",
        },
      },
    },
    proof: {
      headline: "People like you fix this [in a week].",
      body: "One true, specific line of proof.",
    },
    recap: {
      headline: "How this works for you",
    },
    account: {
      headline: "Your plan is ready. [Save it] to see your price.",
      // A count is a representation to a buyer: written by hand, nothing updates it, so it has
      // to be true and kept true in every deck. Empty draws nothing.
      note: "",
    },
    paywall: {
      headline: "Unlock [all of Appname].",
    },
    checkout: {
      headline: "Payment details.",
    },
  },

  recap: {
    closing: "Appname gives you [the outcome] every day.",
    answers: ["The first thing it does", "The second thing it does", "Where it works"],
  },

  account: {
    notConfigured: "Accounts aren’t configured in this environment.",
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "Password (8+ characters)",
    busy: "One moment…",
    noPassword: "No password. We'll email you a 6-digit code.",
    /** The account step's tick under the reader's problem: the line of the plan that answers it. */
    fix: {
      time: "The hours handed back, every week.",
      money: "Every cost in plain sight.",
      stress: "One place that remembers for you.",
      progress: "Progress you can see at a glance.",
    },
    createAccount: "Create account",
    signIn: "Sign in",
    or: "or",
    useCode: "Email me a code instead",
    usePassword: "Use a password instead",
    haveAccount: "Already have an account? Sign in",
    newHere: "New here? Create an account",
    codeSent: "Code sent to {email}.",
    continue: "Continue",
    resendIn: "Resend in {seconds}s",
    resend: "Send a new code",
    changeEmail: "Change email",
    /** Meta's wording, as their Login button words it in each language. */
    facebook: "Continue with Facebook",
    /** Apple permits "Continue with Apple" and "Sign in with Apple" only, each in Apple's own
     * translation; Google's button reads as its generator words it in that language. */
    apple: "Continue with Apple",
    google: "Sign in with Google",
  },

  /** By GoTrue's error code. A code with no entry shows GoTrue's own words in English and
   * `unknown` everywhere else, since those words are only ever English. */
  authErrors: {
    link_failed: "That didn’t work. Send yourself a new code.",
    not_configured: "Sign-in is not configured.",
    otp_expired: "That code has expired or was already used. Send yourself a new one.",
    over_email_send_rate_limit: "Too many emails to this address. Wait a minute and try again.",
    over_request_rate_limit: "Too many attempts. Wait a minute and try again.",
    invalid_credentials: "That email and password don’t match.",
    email_address_invalid: "That email address doesn’t look right.",
    weak_password: "Choose a longer password.",
    user_already_exists: "There is already an account with this email. Sign in instead.",
    email_exists: "There is already an account with this email. Sign in instead.",
    unknown: "Something went wrong on our side. Try again in a minute.",
  },

  legal: { terms: "Terms", privacy: "Privacy Policy" },

  paywall: {
    pros: ["The first thing it does", "The second thing it does", "Where it works"],
    monthly: "Monthly",
    yearly: "Yearly",
    lifetime: "Lifetime",
    perMonth: "/ month",
    perYear: "/ year",
    perDay: "per day",
    once: "once",
    cancelAnytime: "Cancel anytime",
    billedYearly: "Billed once a year",
    save: "Save {percent}",
    forever: "Pay once. Yours forever.",
    // Both lines are written by hand and neither updates itself, so they have to be made true
    // and kept true, in every deck at once. Empty draws nothing.
    lifetimeLeft: "",
    weekly: "",
    guarantee: "30-day money-back guarantee, no questions asked.",
    continue: "Continue",
  },

  reviews: {
    title: "What others are saying",
    dot: "Review {n} of {count}",
    rating: "Rated {n} out of 5",
    /** Real reviews only, quoted with permission. Empty hides the section. */
    items: [] as { name: string; role: string; rating: string; quote: string }[],
  },

  faq: {
    title: "FAQ",
    items: [
      {
        question: "Do all plans include everything?",
        answer: "Yes. Every plan unlocks the same Appname. Only the way you pay differs.",
      },
      {
        question: "What happens to my data if I cancel?",
        answer: "Nothing is deleted. Everything you saved still opens; what stops is adding more.",
      },
      {
        question: "Can I get my money back?",
        answer: "Yes, within 30 days and without giving a reason. Write to support@appname.example from the address you paid with.",
      },
      {
        question: "Which devices does it run on?",
        answer: "Appname is an iPhone app. One account signs you in on every iPhone you own.",
      },
      {
        question: "Who handles the payment?",
        answer: "Our payment provider, the merchant of record. It takes the card, adds the VAT or sales tax your country charges and emails you the receipt. Your card details never reach us.",
      },
    ],
  },

  checkout: {
    platforms: "Appname is an iPhone app. Install it and sign in with this account.",
    cancelAnytime: "Cancel anytime.",
    notConfigured: "Checkout isn’t configured in this environment.",
    needsAccount: "Access is tied to an account, so it needs one first.",
    createYours: "Create yours",
    opening: "Getting the payment form ready…",
    retry: "That didn’t open. Try again in a moment.",
    tryAgain: "Try again",
    failed: "The payment form didn’t load. Reload the page to try again.",
    summary: "Order summary",
    subtotal: "Subtotal",
    discount: "Discount",
    tax: "Tax",
    total: "Total",
    renews: "Renews at {amount} / {cycle}. Cancel anytime.",
    noRenewal: "One payment. Nothing renews, so there is nothing to cancel.",
    cycles: { day: "day", week: "week", month: "month", year: "year" },
  },

  done: {
    eyebrow: "You’re in",
    headline: "Now get it on your [phone]",
    body: "Install Appname on your iPhone and sign in with the account you just created. Your plan is already on it, so no paywall is waiting for you.",
    badge: "Download on the App Store",
    receipt: "You’ll get the receipt by email. Manage or cancel your subscription any time from the app.",
  },
};
