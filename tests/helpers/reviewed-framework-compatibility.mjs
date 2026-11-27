import assert from "node:assert/strict";
// Exact reviewed client-only effect and document-navigation spans.
export const clientDeltas = {
  "app/login/manager/reset-password/ResetPasswordClient.tsx": [
    {
      "start": 6,
      "count": 1,
      "removed": [
        "import {useEffect,useRef,useState,type FormEvent} from \"react\";"
      ],
      "added": [
        "import {startTransition,useEffect,useRef,useState,type FormEvent} from \"react\";"
      ]
    },
    {
      "start": 10,
      "count": 1,
      "removed": [
        "  useEffect(()=>{if(loaded.current)return;loaded.current=true;const value=new URLSearchParams(window.location.hash.slice(1)).get(\"token\")??\"\";window.history.replaceState(null,\"\",window.location.pathname);if(/^[A-Za-z0-9_-]{43}$/.test(value))setToken(value);else setMessage(\"Open the reset link from your recovery email, or request a new link.\");},[]);"
      ],
      "added": [
        "  useEffect(()=>{if(loaded.current)return;loaded.current=true;const value=new URLSearchParams(window.location.hash.slice(1)).get(\"token\")??\"\";window.history.replaceState(null,\"\",window.location.pathname);startTransition(()=>{if(/^[A-Za-z0-9_-]{43}$/.test(value))setToken(value);else setMessage(\"Open the reset link from your recovery email, or request a new link.\");});},[]);"
      ]
    }
  ],
  "app/manager/settings/security/SecuritySettingsClient.tsx": [
    {
      "start": 1,
      "count": 0,
      "removed": [],
      "added": [
        "import { navigateSessionDocument } from \"@/lib/sessionDocumentNavigation\";"
      ]
    },
    {
      "start": 65,
      "count": 1,
      "removed": [
        "      if (data.requiresLogin) { window.location.assign(\"/login/manager\"); return; }"
      ],
      "added": [
        "      if (data.requiresLogin) { navigateSessionDocument(\"/login/manager\"); return; }"
      ]
    },
    {
      "start": 118,
      "count": 1,
      "removed": [
        "      if (data.requiresLogin) { window.location.assign(\"/login/manager\"); return; }"
      ],
      "added": [
        "      if (data.requiresLogin) { navigateSessionDocument(\"/login/manager\"); return; }"
      ]
    }
  ],
  "app/setup/account-code/AccountCodeClient.tsx": [
    {
      "start": 3,
      "count": 1,
      "removed": [
        "import { useEffect, useRef, useState } from \"react\";"
      ],
      "added": [
        "import { startTransition,  useEffect, useRef, useState } from \"react\";"
      ]
    },
    {
      "start": 77,
      "count": 1,
      "removed": [
        "      setAvailable(true);"
      ],
      "added": [
        "      startTransition(() => setAvailable(true));"
      ]
    },
    {
      "start": 113,
      "count": 2,
      "removed": [
        "      setAvailable(null);",
        "      setChecking(false);"
      ],
      "added": [
        "      startTransition(() => { setAvailable(null); setChecking(false); });"
      ]
    },
    {
      "start": 119,
      "count": 2,
      "removed": [
        "      setAvailable(true);",
        "      setChecking(false);"
      ],
      "added": [
        "      startTransition(() => { setAvailable(true); setChecking(false); });"
      ]
    },
    {
      "start": 130,
      "count": 2,
      "removed": [
        "    setAvailable(null);",
        "    setChecking(true);"
      ],
      "added": [
        "    startTransition(() => { setAvailable(null); setChecking(true); });"
      ]
    }
  ],
  "app/setup/recurring/billing/RecurringBillingClient.tsx": [
    {
      "start": 5,
      "count": 1,
      "removed": [
        "import { useEffect, useRef, useState } from \"react\";"
      ],
      "added": [
        "import { startTransition,  useEffect, useRef, useState } from \"react\";"
      ]
    },
    {
      "start": 328,
      "count": 1,
      "removed": [
        "      setSaveStatus(\"idle\");"
      ],
      "added": [
        "      startTransition(() => setSaveStatus(\"idle\"));"
      ]
    }
  ],
  "app/setup/recurring/charges/RecurringChargesClient.tsx": [
    {
      "start": 4,
      "count": 1,
      "removed": [
        "import { useEffect, useMemo, useRef, useState } from \"react\";"
      ],
      "added": [
        "import { startTransition,  useEffect, useMemo, useRef, useState } from \"react\";"
      ]
    },
    {
      "start": 499,
      "count": 1,
      "removed": [
        "      setSaveStatus(\"idle\");"
      ],
      "added": [
        "      startTransition(() => setSaveStatus(\"idle\"));"
      ]
    }
  ],
  "app/setup/recurring/tiers/RecurringTiersClient.tsx": [
    {
      "start": 3,
      "count": 1,
      "removed": [
        "import { useEffect, useRef, useState } from \"react\";"
      ],
      "added": [
        "import { startTransition,  useEffect, useRef, useState } from \"react\";"
      ]
    },
    {
      "start": 299,
      "count": 2,
      "removed": [
        "      setSaveStatus(\"error\");",
        "      setError(validationError);"
      ],
      "added": [
        "      startTransition(() => { setSaveStatus(\"error\"); setError(validationError); });"
      ]
    },
    {
      "start": 304,
      "count": 1,
      "removed": [
        "    setError(\"\");"
      ],
      "added": [
        "    startTransition(() => setError(\"\"));"
      ]
    }
  ],
  "components/ManagerPushControls.tsx": [
    {
      "start": 3,
      "count": 1,
      "removed": [
        "import { useCallback, useEffect, useRef, useState } from \"react\";"
      ],
      "added": [
        "import { startTransition,  useCallback, useEffect, useRef, useState } from \"react\";"
      ]
    },
    {
      "start": 29,
      "count": 1,
      "removed": [
        "    void check();"
      ],
      "added": [
        "    startTransition(() => { void check(); });"
      ]
    }
  ],
  "components/setup/PaginatedRecurringConfiguration.tsx": [
    {
      "start": 4,
      "count": 1,
      "removed": [
        "import { useCallback, useEffect, useRef, useState } from \"react\";"
      ],
      "added": [
        "import { startTransition,  useCallback, useEffect, useRef, useState } from \"react\";"
      ]
    },
    {
      "start": 41,
      "count": 1,
      "removed": [
        "  useEffect(() => { void load().catch(error => setMessage(error.message)); }, [load]);"
      ],
      "added": [
        "  useEffect(() => { startTransition(() => { void load().catch(error => setMessage(error.message)); }); }, [load]);"
      ]
    }
  ]
};

export function applyReviewedClientDeltas(file,source){
 const deltas=clientDeltas[file];if(!deltas)return source;
 const lines=source.replace(/\r\n/g,"\n").split("\n"),output=[];let cursor=0;
 for(const d of deltas){const start=d.count===0?d.start:d.start-1;assert.deepEqual(lines.slice(start,start+d.count),d.removed,"Exact reviewed client span: "+file);output.push(...lines.slice(cursor,start),...d.added);cursor=start+d.count;}
 output.push(...lines.slice(cursor));return output.join("\n");
}
