// Exact reviewed security dependency entries; every other entry remains pinned to the approved checkpoint.
import assert from "node:assert/strict";
export const securityLockDeltas = [
  {
    "path": "",
    "before": {
      "name": "rentfraylite-platform",
      "version": "1.0.0",
      "dependencies": {
        "@prisma/client": "^5.22.0",
        "bcryptjs": "^3.0.3",
        "next": "^16.4.3",
        "prisma": "^5.22.0",
        "qrcode": "1.5.4",
        "react": "19.2.3",
        "react-dom": "19.2.3",
        "stripe": "^20.4.1",
        "web-push": "4.0.0",
        "zod": "^4.6.7"
      },
      "devDependencies": {
        "@playwright/test": "^1.58.2",
        "@tailwindcss/postcss": "^4",
        "@types/node": "^20.19.37",
        "@types/qrcode": "1.5.6",
        "@types/react": "^19",
        "@types/react-dom": "^19",
        "@types/web-push": "3.6.4",
        "esbuild": "0.28.2",
        "eslint": "^9",
        "eslint-config-next": "^16.1.7",
        "tailwindcss": "^4",
        "tsx": "^4.22.5",
        "typescript": "^5.9.3"
      },
      "engines": {
        "node": "22.x"
      }
    },
    "after": {
      "name": "rentfraylite-platform",
      "version": "1.0.0",
      "dependencies": {
        "@prisma/client": "^5.22.0",
        "bcryptjs": "^3.0.3",
        "next": "16.4.6",
        "prisma": "^5.22.0",
        "qrcode": "1.5.4",
        "react": "19.2.3",
        "react-dom": "19.2.3",
        "stripe": "^20.4.1",
        "web-push": "4.0.0",
        "zod": "^4.6.7"
      },
      "devDependencies": {
        "@playwright/test": "^1.58.2",
        "@tailwindcss/postcss": "^4",
        "@types/node": "^20.19.37",
        "@types/qrcode": "1.5.6",
        "@types/react": "^19",
        "@types/react-dom": "^19",
        "@types/web-push": "3.6.4",
        "esbuild": "0.28.2",
        "eslint": "^9",
        "eslint-config-next": "16.4.6",
        "tailwindcss": "^4",
        "tsx": "^4.22.5",
        "typescript": "^5.9.3"
      },
      "engines": {
        "node": "22.x"
      }
    }
  },
  {
    "path": "node_modules/@babel/core",
    "before": {
      "version": "7.29.7",
      "resolved": "https://registry.npmjs.org/@babel/core/-/core-7.29.7.tgz",
      "integrity": "sha512-RgHBCvtjbOK2gXSNBNIkNoEc9qoVEtau3hj8gEqKQuL3HZAibKarWFEI3Lfm6EYKkLalOh8eSrj9b+ch9H/VBA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/code-frame": "^7.29.7",
        "@babel/generator": "^7.29.7",
        "@babel/helper-compilation-targets": "^7.29.7",
        "@babel/helper-module-transforms": "^7.29.7",
        "@babel/helpers": "^7.29.7",
        "@babel/parser": "^7.29.7",
        "@babel/template": "^7.29.7",
        "@babel/traverse": "^7.29.7",
        "@babel/types": "^7.29.7",
        "@jridgewell/remapping": "^2.3.5",
        "convert-source-map": "^2.0.0",
        "debug": "^4.1.0",
        "gensync": "^1.0.0-beta.2",
        "json5": "^2.2.3",
        "semver": "^6.3.1"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/babel"
      }
    },
    "after": {
      "version": "7.29.13",
      "resolved": "https://registry.npmjs.org/@babel/core/-/core-7.29.13.tgz",
      "integrity": "sha512-j1nvOQCZYSgp7HLmisnCXFTpVvFODiijQ9QHkORfGKWH6YDtskTEeCJS7eV545GZ9UBzrq0e2xsOd5QQ5PjIqw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/code-frame": "^7.29.7",
        "@babel/generator": "^7.29.13",
        "@babel/helper-compilation-targets": "^7.29.13",
        "@babel/helper-module-transforms": "^7.29.13",
        "@babel/helpers": "^7.29.13",
        "@babel/parser": "^7.29.13",
        "@babel/template": "^7.29.7",
        "@babel/traverse": "^7.29.13",
        "@babel/types": "^7.29.11",
        "@jridgewell/remapping": "^2.3.5",
        "convert-source-map": "^2.0.0",
        "debug": "^4.1.0",
        "gensync": "^1.0.0-beta.2",
        "json5": "^2.2.3",
        "semver": "^6.3.1"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/babel"
      }
    }
  },
  {
    "path": "node_modules/@babel/generator",
    "before": {
      "version": "7.29.8",
      "resolved": "https://registry.npmjs.org/@babel/generator/-/generator-7.29.8.tgz",
      "integrity": "sha512-gZbepsdh3WDtgZKWL+vTPh71LSBrm/Y4/QDZBVCcYfmeTEEuoOYwlSy+G1StfJg+/Zy550u/3TATbm7qDbbMtg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/parser": "^7.29.8",
        "@babel/types": "^7.29.8",
        "@jridgewell/gen-mapping": "^0.3.12",
        "@jridgewell/trace-mapping": "^0.3.28",
        "jsesc": "^3.0.2"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "after": {
      "version": "7.29.15",
      "resolved": "https://registry.npmjs.org/@babel/generator/-/generator-7.29.15.tgz",
      "integrity": "sha512-gNWJUX0FlevflramOkaInywOMhU1lkln38gAC7TFZv2tsWbLYbN/2WZFGcq8zbX0Z55e4vGa27IB/NaeZoauWQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/parser": "^7.29.15",
        "@babel/types": "^7.29.15",
        "@jridgewell/gen-mapping": "^0.3.12",
        "@jridgewell/trace-mapping": "^0.3.28",
        "jsesc": "^3.0.2"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    }
  },
  {
    "path": "node_modules/@babel/helper-compilation-targets",
    "before": {
      "version": "7.29.7",
      "resolved": "https://registry.npmjs.org/@babel/helper-compilation-targets/-/helper-compilation-targets-7.29.7.tgz",
      "integrity": "sha512-wem6WaBj4NaVYVdNhLPPVacES6ZJ+KBBfSkTMD3YZxbP3rm3Di85tJU5ljaUNhaOynt+Aj0xruhYuzQBt8n71g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/compat-data": "^7.29.7",
        "@babel/helper-validator-option": "^7.29.7",
        "browserslist": "^4.24.0",
        "lru-cache": "^5.1.1",
        "semver": "^6.3.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "after": {
      "version": "7.29.13",
      "resolved": "https://registry.npmjs.org/@babel/helper-compilation-targets/-/helper-compilation-targets-7.29.13.tgz",
      "integrity": "sha512-8WxJ4/Vmes3ghacj8VOJy3NW8eyHiFY/4thU/LSBuBE470+igjR/j1ZTNn8fV5VdNrLx6iXUwig526UdOvfP0w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/compat-data": "^7.29.7",
        "@babel/helper-validator-option": "^7.29.7",
        "browserslist": "^4.24.0",
        "lru-cache": "^5.1.1",
        "semver": "^6.3.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    }
  },
  {
    "path": "node_modules/@babel/helper-module-transforms",
    "before": {
      "version": "7.29.7",
      "resolved": "https://registry.npmjs.org/@babel/helper-module-transforms/-/helper-module-transforms-7.29.7.tgz",
      "integrity": "sha512-UPUVSyXbOh627KiCIGQSgwWzGeBKLkaJ9PJEdrngIwMSzxLR4jS4+f1f1jb7VzBbg8nFLaYotvVPFCTqdrmTAg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-module-imports": "^7.29.7",
        "@babel/helper-validator-identifier": "^7.29.7",
        "@babel/traverse": "^7.29.7"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0"
      }
    },
    "after": {
      "version": "7.29.14",
      "resolved": "https://registry.npmjs.org/@babel/helper-module-transforms/-/helper-module-transforms-7.29.14.tgz",
      "integrity": "sha512-2XDvQVd9JESaOgGc4jT2/jquTAO7ppA5noTZQqH+MmZ89yjCzScLwtCPbWtkPZylL+TLWR49IwWmk+QkRR4GsA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-module-imports": "^7.29.7",
        "@babel/helper-validator-identifier": "^7.29.7",
        "@babel/traverse": "^7.29.14"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0"
      }
    }
  },
  {
    "path": "node_modules/@babel/helper-string-parser",
    "before": {
      "version": "7.29.11",
      "resolved": "https://registry.npmjs.org/@babel/helper-string-parser/-/helper-string-parser-7.29.11.tgz",
      "integrity": "sha512-snZbO7MEDOof+hvNa97EjEY7qD7h2kwvQr5AJC3ZhQudKW5dnej6k3kP9NQV88hJwaS8vDqRLFo9rivLEhle2g==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "after": {
      "version": "7.29.15",
      "resolved": "https://registry.npmjs.org/@babel/helper-string-parser/-/helper-string-parser-7.29.15.tgz",
      "integrity": "sha512-C2FuapQ2Kh1OnVHAoLi5rD3GBJ8COb9Q609T6HEpLqaBAo560PDP5OxBE5dCI/h951MBO/+bCUYU5SZ+8ZlV+w==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    }
  },
  {
    "path": "node_modules/@babel/helpers",
    "before": {
      "version": "7.29.10",
      "resolved": "https://registry.npmjs.org/@babel/helpers/-/helpers-7.29.10.tgz",
      "integrity": "sha512-EMCx3AGZ3WfAl6ht7AyQoPm2Lh+BGYEMdc4Q6Hf7uSCDOZFuLq44qNwL+iaim8VlyYhRAo4X43+weadK8ZB4Yg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/template": "^7.29.7",
        "@babel/types": "^7.29.8"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "after": {
      "version": "7.29.15",
      "resolved": "https://registry.npmjs.org/@babel/helpers/-/helpers-7.29.15.tgz",
      "integrity": "sha512-l+ezV2czw3t2d2ELq+3CwPL4WLKK5O8IywBXb9/gpmbCOVZFmRYJPmHVqSCv2k+8iKbE30Zf54siOoIZ52XOxA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/template": "^7.29.7",
        "@babel/types": "^7.29.15"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    }
  },
  {
    "path": "node_modules/@babel/parser",
    "before": {
      "version": "7.29.11",
      "resolved": "https://registry.npmjs.org/@babel/parser/-/parser-7.29.11.tgz",
      "integrity": "sha512-OZ6+oaK7GMyg3IfCpj8JOmn8n+w2rJbDT0LLfVDTLb1ZFeKDh3AiNELgCMUw175IJHSkLl74hG0M0VLsvx+gag==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/types": "^7.29.11"
      },
      "bin": {
        "parser": "bin/babel-parser.js"
      },
      "engines": {
        "node": ">=6.0.0"
      }
    },
    "after": {
      "version": "7.29.15",
      "resolved": "https://registry.npmjs.org/@babel/parser/-/parser-7.29.15.tgz",
      "integrity": "sha512-RpKWyisHoP81twtSCgmE02iU0RnPcq1DN5bBEbpUePrjA9Q3wXhufnCJrrayPpoZieqFh3zyZQqwtSK0gGccRA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/types": "^7.29.15"
      },
      "bin": {
        "parser": "bin/babel-parser.js"
      },
      "engines": {
        "node": ">=6.0.0"
      }
    }
  },
  {
    "path": "node_modules/@babel/traverse",
    "before": {
      "version": "7.29.10",
      "resolved": "https://registry.npmjs.org/@babel/traverse/-/traverse-7.29.10.tgz",
      "integrity": "sha512-B3lYAs2nkKskbgQ1nfy8Ma9ao9Q1rntTAQHrzzyDuj+TSO+X3le6PfWwqDvodsb+OumE10eMFfuMCTQSQ5iuIQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/code-frame": "^7.29.7",
        "@babel/generator": "^7.29.8",
        "@babel/helper-globals": "^7.29.7",
        "@babel/parser": "^7.29.9",
        "@babel/template": "^7.29.7",
        "@babel/types": "^7.29.8",
        "debug": "^4.3.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "after": {
      "version": "7.29.15",
      "resolved": "https://registry.npmjs.org/@babel/traverse/-/traverse-7.29.15.tgz",
      "integrity": "sha512-ZfawBo2i8vvt+BTt37dWDKBPjUfm/H+bw+ltwsCRhW7gPtyNVwUXuNo54eO2Xo+P4VXpalPFfFISbBTRKC8SOQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/code-frame": "^7.29.7",
        "@babel/generator": "^7.29.15",
        "@babel/helper-globals": "^7.29.7",
        "@babel/parser": "^7.29.15",
        "@babel/template": "^7.29.7",
        "@babel/types": "^7.29.15",
        "debug": "^4.3.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    }
  },
  {
    "path": "node_modules/@babel/types",
    "before": {
      "version": "7.29.11",
      "resolved": "https://registry.npmjs.org/@babel/types/-/types-7.29.11.tgz",
      "integrity": "sha512-WCsemW40Cpc6gouC1SrY6PBaZ+oLRlEVY9XBvZBI7il/HyUrb2nJ505wE1MHEFyDZNnrWDEuy4jL50WVHfTTSQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-string-parser": "^7.29.11",
        "@babel/helper-validator-identifier": "^7.29.7"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "after": {
      "version": "7.29.15",
      "resolved": "https://registry.npmjs.org/@babel/types/-/types-7.29.15.tgz",
      "integrity": "sha512-/XKpKDakL//LZ66bq1XsZOswuqeI5MZqPLDu18o3XdkU1fNJ7bdPtzgnc4ZNS+bBGHV0FJG8jjb8SwcC3nNVQQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-string-parser": "^7.29.15",
        "@babel/helper-validator-identifier": "^7.29.7"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    }
  },
  {
    "path": "node_modules/@next/env",
    "before": {
      "version": "16.4.3",
      "resolved": "https://registry.npmjs.org/@next/env/-/env-16.4.3.tgz",
      "integrity": "sha512-a7tz1QCcWWkwC/rPJcPMJk/UNRu9CFhDd3OHYE5hddbJrs8BqRTalxI6GlKCWEGzRLHN+S/B7a4PAHCtm25aBQ==",
      "license": "MIT"
    },
    "after": {
      "version": "16.4.6",
      "resolved": "https://registry.npmjs.org/@next/env/-/env-16.4.6.tgz",
      "integrity": "sha512-SunBjJ6t+oBtecS3dTjdVuMhUogP5wD/vrGL5EVuQYM1iS4O5ilL51HkiJ3sPjMzRHiCChvr4dbaSJbR7F3lxA==",
      "license": "MIT"
    }
  },
  {
    "path": "node_modules/@next/eslint-plugin-next",
    "before": {
      "version": "16.1.7",
      "resolved": "https://registry.npmjs.org/@next/eslint-plugin-next/-/eslint-plugin-next-16.1.7.tgz",
      "integrity": "sha512-v/bRGOJlfRCO+NDKt0bZlIIWjhMKU8xbgEQBo+rV9C8S6czZvs96LZ/v24/GvpEnovZlL4QDpku/RzWHVbmPpA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "fast-glob": "3.3.1"
      }
    },
    "after": {
      "version": "16.4.6",
      "resolved": "https://registry.npmjs.org/@next/eslint-plugin-next/-/eslint-plugin-next-16.4.6.tgz",
      "integrity": "sha512-HdqERVOafOD8JaUSAkwf9aSu/1rsHlkN8C5GcXYBH3C/z1MxBhZFxB5rz/xqMMRiIj7r9tIv8OCLQ9JWUxCvWA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@eslint-community/eslint-utils": "4.9.1",
        "fast-glob": "3.3.1"
      }
    }
  },
  {
    "path": "node_modules/@next/swc-darwin-arm64",
    "before": {
      "version": "16.4.3",
      "resolved": "https://registry.npmjs.org/@next/swc-darwin-arm64/-/swc-darwin-arm64-16.4.3.tgz",
      "integrity": "sha512-4yq5EXBt+VDtAZwTyfijaFp5D2C5oz3Ikw5a2kiX2K9nw72vrZX2q5UuAlkPtUMO1tQz6JTKpaKWjS7OOefTDQ==",
      "cpu": [
        "arm64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">= 10"
      }
    },
    "after": {
      "version": "16.4.6",
      "resolved": "https://registry.npmjs.org/@next/swc-darwin-arm64/-/swc-darwin-arm64-16.4.6.tgz",
      "integrity": "sha512-kJ4VVZkley17xKaJx72QN2IBqjrj7zenCQZaUF0l9ShS/1Mt2kW4+Z5KGG6vgr3L/J562xTOizVyM1iA/u5nlg==",
      "cpu": [
        "arm64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">= 10"
      }
    }
  },
  {
    "path": "node_modules/@next/swc-darwin-x64",
    "before": {
      "version": "16.4.3",
      "resolved": "https://registry.npmjs.org/@next/swc-darwin-x64/-/swc-darwin-x64-16.4.3.tgz",
      "integrity": "sha512-1Rvkn/LUhnEF8WxnRkOrqGhbwXui1bkWFxONKIbN+r7C+9KHDSZ+iUoj4CzymVMWUyZIyx9szcb9+kbKhD500A==",
      "cpu": [
        "x64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">= 10"
      }
    },
    "after": {
      "version": "16.4.6",
      "resolved": "https://registry.npmjs.org/@next/swc-darwin-x64/-/swc-darwin-x64-16.4.6.tgz",
      "integrity": "sha512-eIPGZIqC+8JKaeZmvnCANJQF4xWkkHqSnAAajtFxgwDMAOnCgxNvP52SeWZ41PyVwoe+Le/NQuZSaQ8j7YshSA==",
      "cpu": [
        "x64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">= 10"
      }
    }
  },
  {
    "path": "node_modules/@next/swc-linux-arm64-gnu",
    "before": {
      "version": "16.4.3",
      "resolved": "https://registry.npmjs.org/@next/swc-linux-arm64-gnu/-/swc-linux-arm64-gnu-16.4.3.tgz",
      "integrity": "sha512-dCKpXErGg3abUM6t5JTJV/ottVBTStJB5lRJTbgdUdQaQ+jNHiK56Hsc0YAEg/rinSh42hYG3HWiYmEMdilnxg==",
      "cpu": [
        "arm64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 10"
      }
    },
    "after": {
      "version": "16.4.6",
      "resolved": "https://registry.npmjs.org/@next/swc-linux-arm64-gnu/-/swc-linux-arm64-gnu-16.4.6.tgz",
      "integrity": "sha512-9nI6O8vvczH2D9ZNdMGqb/3NuT15T9ksOZnAmx9/gjF2cOi74+xxyf1Hk96uIMfm14c9y6wHeBq6SH8g6udvcA==",
      "cpu": [
        "arm64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 10"
      }
    }
  },
  {
    "path": "node_modules/@next/swc-linux-arm64-musl",
    "before": {
      "version": "16.4.3",
      "resolved": "https://registry.npmjs.org/@next/swc-linux-arm64-musl/-/swc-linux-arm64-musl-16.4.3.tgz",
      "integrity": "sha512-WwYbhWkhYBvBtib1K4W0kL8MW2snBD2A5b3SN4vPpqalZbZs5+bQ1yzAdepVoOqrFfEW3dmREy4Zs1MrWcrFbw==",
      "cpu": [
        "arm64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 10"
      }
    },
    "after": {
      "version": "16.4.6",
      "resolved": "https://registry.npmjs.org/@next/swc-linux-arm64-musl/-/swc-linux-arm64-musl-16.4.6.tgz",
      "integrity": "sha512-7/qPhTxDp2ScluOJOhLuhWmlA17o1yZ0SIgpISBCpBxXgtnK4+KGywBpFkfLPiU1rnSM1faFGzYkH6i7JdTrqA==",
      "cpu": [
        "arm64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 10"
      }
    }
  },
  {
    "path": "node_modules/@next/swc-linux-x64-gnu",
    "before": {
      "version": "16.4.3",
      "resolved": "https://registry.npmjs.org/@next/swc-linux-x64-gnu/-/swc-linux-x64-gnu-16.4.3.tgz",
      "integrity": "sha512-QymWvfUwDEC5/lpJOsxX5VAbyoR2D13+2Jsjz4be7gT4LPqEgdpkeLIR/HFfCLgKzoMhpJbp6I/JnogyNZHcaA==",
      "cpu": [
        "x64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 10"
      }
    },
    "after": {
      "version": "16.4.6",
      "resolved": "https://registry.npmjs.org/@next/swc-linux-x64-gnu/-/swc-linux-x64-gnu-16.4.6.tgz",
      "integrity": "sha512-oOpbNa8XOW1qCGd9VvzC4fbkkRxEls7/WI6tz+YHC0xRA7KpV1U7DrAnCPjzVyOk/karzWEepCOcTIDmwK8FwQ==",
      "cpu": [
        "x64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 10"
      }
    }
  },
  {
    "path": "node_modules/@next/swc-linux-x64-musl",
    "before": {
      "version": "16.4.3",
      "resolved": "https://registry.npmjs.org/@next/swc-linux-x64-musl/-/swc-linux-x64-musl-16.4.3.tgz",
      "integrity": "sha512-Vmjd9D7DpA4Vv3cUlr82QWgJD/BQZmns801vtC5VWHg6jCIA4a5vMKpQnfrM2pyCrp2eV0ENdUg4PlN3bAc2Yw==",
      "cpu": [
        "x64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 10"
      }
    },
    "after": {
      "version": "16.4.6",
      "resolved": "https://registry.npmjs.org/@next/swc-linux-x64-musl/-/swc-linux-x64-musl-16.4.6.tgz",
      "integrity": "sha512-aM8CZ+OR2EwXaAYw7KGkW2GDmNDsLBIRe1MMRZCJPTdw/xhTD0IMUVO4sf3KqrzuRouGzwwLZn34+gFeVXiUQA==",
      "cpu": [
        "x64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 10"
      }
    }
  },
  {
    "path": "node_modules/@next/swc-win32-arm64-msvc",
    "before": {
      "version": "16.4.3",
      "resolved": "https://registry.npmjs.org/@next/swc-win32-arm64-msvc/-/swc-win32-arm64-msvc-16.4.3.tgz",
      "integrity": "sha512-lG1pPdPLk7gTyGb00n5JIMLdBJgjb+UEhSdZvFbhUMg0DyC6z4B7RnpSKF9VCd4imkLObVbXOFA0kFCpw7yFow==",
      "cpu": [
        "arm64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">= 10"
      }
    },
    "after": {
      "version": "16.4.6",
      "resolved": "https://registry.npmjs.org/@next/swc-win32-arm64-msvc/-/swc-win32-arm64-msvc-16.4.6.tgz",
      "integrity": "sha512-U0p7/tEtqvHX2crhd841CDwKtp5CFkKXVjOhmfccR3Pvp64sj8KBwRqsvltqLOwVBbj0NtkxwXSDpEHYGbxeXQ==",
      "cpu": [
        "arm64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">= 10"
      }
    }
  },
  {
    "path": "node_modules/@next/swc-win32-x64-msvc",
    "before": {
      "version": "16.4.3",
      "resolved": "https://registry.npmjs.org/@next/swc-win32-x64-msvc/-/swc-win32-x64-msvc-16.4.3.tgz",
      "integrity": "sha512-NmQC9RkJdnPXRaMxtkCzobB3teVjqF33oSOnwDfi+XYGWWYpt+xlGK3mtktSKLbdjwaWbJu2OkkMiRFGUUncKg==",
      "cpu": [
        "x64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">= 10"
      }
    },
    "after": {
      "version": "16.4.6",
      "resolved": "https://registry.npmjs.org/@next/swc-win32-x64-msvc/-/swc-win32-x64-msvc-16.4.6.tgz",
      "integrity": "sha512-3ZG15/5WIdlTQsIEvc9sPTTSL5XFrlLklIKmfF4fwsDnoAhu6NcBDXsk3mbGxNyo6aVLEGex+fHCv2MahY7a9g==",
      "cpu": [
        "x64"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">= 10"
      }
    }
  },
  {
    "path": "node_modules/@typescript-eslint/eslint-plugin",
    "before": {
      "version": "8.57.1",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/eslint-plugin/-/eslint-plugin-8.57.1.tgz",
      "integrity": "sha512-Gn3aqnvNl4NGc6x3/Bqk1AOn0thyTU9bqDRhiRnUWezgvr2OnhYCWCgC8zXXRVqBsIL1pSDt7T9nJUe0oM0kDQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@eslint-community/regexpp": "^4.12.2",
        "@typescript-eslint/scope-manager": "8.57.1",
        "@typescript-eslint/type-utils": "8.57.1",
        "@typescript-eslint/utils": "8.57.1",
        "@typescript-eslint/visitor-keys": "8.57.1",
        "ignore": "^7.0.5",
        "natural-compare": "^1.4.0",
        "ts-api-utils": "^2.4.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "@typescript-eslint/parser": "^8.57.1",
        "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
        "typescript": ">=4.8.4 <6.0.0"
      }
    },
    "after": {
      "version": "8.74.0",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/eslint-plugin/-/eslint-plugin-8.74.0.tgz",
      "integrity": "sha512-z3KXk1+Vm+d82ZRplOoC89ho4Rf1da5ju6sx8//92GnN532U62DGPjECXkkVqtYzIv0zoJlpO39SX2Z9tk6LVw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@eslint-community/regexpp": "^4.12.2",
        "@typescript-eslint/scope-manager": "8.74.0",
        "@typescript-eslint/type-utils": "8.74.0",
        "@typescript-eslint/utils": "8.74.0",
        "@typescript-eslint/visitor-keys": "8.74.0",
        "ignore": "^7.0.5",
        "natural-compare": "^1.4.0",
        "ts-api-utils": "^2.5.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "@typescript-eslint/parser": "^8.74.0",
        "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
        "typescript": ">=4.8.4 <6.1.0"
      }
    }
  },
  {
    "path": "node_modules/@typescript-eslint/eslint-plugin/node_modules/ignore",
    "before": {
      "version": "7.0.5",
      "resolved": "https://registry.npmjs.org/ignore/-/ignore-7.0.5.tgz",
      "integrity": "sha512-Hs59xBNfUIunMFgWAbGX5cq6893IbWg4KnrjbYwX3tx0ztorVgTDA6B2sxf8ejHJ4wz8BqGUMYlnzNBer5NvGg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">= 4"
      }
    },
    "after": {
      "version": "7.0.17",
      "resolved": "https://registry.npmjs.org/ignore/-/ignore-7.0.17.tgz",
      "integrity": "sha512-0c3zcBRlWmcKhcIQWckzkYncJRv5HHB8O32wO/FcWL8DDXWDJgiEF6SX9ThbTv5h/eZ+xJK+VvDjjQ+cQJhp3Q==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">= 4"
      }
    }
  },
  {
    "path": "node_modules/@typescript-eslint/parser",
    "before": {
      "version": "8.57.1",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/parser/-/parser-8.57.1.tgz",
      "integrity": "sha512-k4eNDan0EIMTT/dUKc/g+rsJ6wcHYhNPdY19VoX/EOtaAG8DLtKCykhrUnuHPYvinn5jhAPgD2Qw9hXBwrahsw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/scope-manager": "8.57.1",
        "@typescript-eslint/types": "8.57.1",
        "@typescript-eslint/typescript-estree": "8.57.1",
        "@typescript-eslint/visitor-keys": "8.57.1",
        "debug": "^4.4.3"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
        "typescript": ">=4.8.4 <6.0.0"
      }
    },
    "after": {
      "version": "8.74.0",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/parser/-/parser-8.74.0.tgz",
      "integrity": "sha512-ecr8AYdig7avVkxaHdQvxHnIJ/mOyliO4Gv/uWF8q69vBew/z3sexqBwHUZX5Vql+Ns0w4sH6gBLkICGbOvJkA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/scope-manager": "8.74.0",
        "@typescript-eslint/types": "8.74.0",
        "@typescript-eslint/typescript-estree": "8.74.0",
        "@typescript-eslint/visitor-keys": "8.74.0",
        "debug": "^4.4.3"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
        "typescript": ">=4.8.4 <6.1.0"
      }
    }
  },
  {
    "path": "node_modules/@typescript-eslint/project-service",
    "before": {
      "version": "8.57.1",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/project-service/-/project-service-8.57.1.tgz",
      "integrity": "sha512-vx1F37BRO1OftsYlmG9xay1TqnjNVlqALymwWVuYTdo18XuKxtBpCj1QlzNIEHlvlB27osvXFWptYiEWsVdYsg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/tsconfig-utils": "^8.57.1",
        "@typescript-eslint/types": "^8.57.1",
        "debug": "^4.4.3"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "typescript": ">=4.8.4 <6.0.0"
      }
    },
    "after": {
      "version": "8.74.0",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/project-service/-/project-service-8.74.0.tgz",
      "integrity": "sha512-z/mymuE+JlEeSFIv3Mo70EvgG1Zz74Hl0IDfExfXutARAP834bt+MppTD7mVAwmZO0GdxdOAi0jbTam749eH6g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/tsconfig-utils": "^8.74.0",
        "@typescript-eslint/types": "^8.74.0",
        "debug": "^4.4.3"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "typescript": ">=4.8.4 <6.1.0"
      }
    }
  },
  {
    "path": "node_modules/@typescript-eslint/scope-manager",
    "before": {
      "version": "8.57.1",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/scope-manager/-/scope-manager-8.57.1.tgz",
      "integrity": "sha512-hs/QcpCwlwT2L5S+3fT6gp0PabyGk4Q0Rv2doJXA0435/OpnSR3VRgvrp8Xdoc3UAYSg9cyUjTeFXZEPg/3OKg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/types": "8.57.1",
        "@typescript-eslint/visitor-keys": "8.57.1"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      }
    },
    "after": {
      "version": "8.74.0",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/scope-manager/-/scope-manager-8.74.0.tgz",
      "integrity": "sha512-kpOdpu4CpWN5U38ox3f727DwWRBtUAVhyUJtqTBYe5gf2wYoxac7PgKP14txrxN7ICVtcjlLdzjqfRgpSnDKvQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/types": "8.74.0",
        "@typescript-eslint/visitor-keys": "8.74.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      }
    }
  },
  {
    "path": "node_modules/@typescript-eslint/tsconfig-utils",
    "before": {
      "version": "8.57.1",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/tsconfig-utils/-/tsconfig-utils-8.57.1.tgz",
      "integrity": "sha512-0lgOZB8cl19fHO4eI46YUx2EceQqhgkPSuCGLlGi79L2jwYY1cxeYc1Nae8Aw1xjgW3PKVDLlr3YJ6Bxx8HkWg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "typescript": ">=4.8.4 <6.0.0"
      }
    },
    "after": {
      "version": "8.74.0",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/tsconfig-utils/-/tsconfig-utils-8.74.0.tgz",
      "integrity": "sha512-p07wAuaS6BjCYgOSXKJi4YhvTnAf7fiG37e9THcpnYaQEt2QiTTYZWKwUFNgeRiywiMudazhzgddAirZ0GgHtQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "typescript": ">=4.8.4 <6.1.0"
      }
    }
  },
  {
    "path": "node_modules/@typescript-eslint/type-utils",
    "before": {
      "version": "8.57.1",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/type-utils/-/type-utils-8.57.1.tgz",
      "integrity": "sha512-+Bwwm0ScukFdyoJsh2u6pp4S9ktegF98pYUU0hkphOOqdMB+1sNQhIz8y5E9+4pOioZijrkfNO/HUJVAFFfPKA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/types": "8.57.1",
        "@typescript-eslint/typescript-estree": "8.57.1",
        "@typescript-eslint/utils": "8.57.1",
        "debug": "^4.4.3",
        "ts-api-utils": "^2.4.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
        "typescript": ">=4.8.4 <6.0.0"
      }
    },
    "after": {
      "version": "8.74.0",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/type-utils/-/type-utils-8.74.0.tgz",
      "integrity": "sha512-CV3Y3la8l3F9ANfxcfpgSSiQgJTe4IeLEoZV4O/gcW86Ugp8X6SKiQ0vm+QegXaRIbbDMokZZSF3A1CgiU/kPw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/types": "8.74.0",
        "@typescript-eslint/typescript-estree": "8.74.0",
        "@typescript-eslint/utils": "8.74.0",
        "debug": "^4.4.3",
        "ts-api-utils": "^2.5.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
        "typescript": ">=4.8.4 <6.1.0"
      }
    }
  },
  {
    "path": "node_modules/@typescript-eslint/types",
    "before": {
      "version": "8.57.1",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/types/-/types-8.57.1.tgz",
      "integrity": "sha512-S29BOBPJSFUiblEl6RzPPjJt6w25A6XsBqRVDt53tA/tlL8q7ceQNZHTjPeONt/3S7KRI4quk+yP9jK2WjBiPQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      }
    },
    "after": {
      "version": "8.74.0",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/types/-/types-8.74.0.tgz",
      "integrity": "sha512-MpnMrJCVNpP1iVL8NiHkQZgQqIMBH5ewDGUPBh1pqQXwFtMFjsl1M03QcYPXmv6stCKEiF0PN7CGbU1ZbXFzEA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      }
    }
  },
  {
    "path": "node_modules/@typescript-eslint/typescript-estree",
    "before": {
      "version": "8.57.1",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/typescript-estree/-/typescript-estree-8.57.1.tgz",
      "integrity": "sha512-ybe2hS9G6pXpqGtPli9Gx9quNV0TWLOmh58ADlmZe9DguLq0tiAKVjirSbtM1szG6+QH6rVXyU6GTLQbWnMY+g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/project-service": "8.57.1",
        "@typescript-eslint/tsconfig-utils": "8.57.1",
        "@typescript-eslint/types": "8.57.1",
        "@typescript-eslint/visitor-keys": "8.57.1",
        "debug": "^4.4.3",
        "minimatch": "^10.2.2",
        "semver": "^7.7.3",
        "tinyglobby": "^0.2.15",
        "ts-api-utils": "^2.4.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "typescript": ">=4.8.4 <6.0.0"
      }
    },
    "after": {
      "version": "8.74.0",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/typescript-estree/-/typescript-estree-8.74.0.tgz",
      "integrity": "sha512-wL348k6l92DNG+kPP5rVpKwNBoz7a3xRZy3TPKc1uymQttd7u7gcMv3eENmcuh4CjC4mO3FTM0DYstFXMyDLuw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/project-service": "8.74.0",
        "@typescript-eslint/tsconfig-utils": "8.74.0",
        "@typescript-eslint/types": "8.74.0",
        "@typescript-eslint/visitor-keys": "8.74.0",
        "debug": "^4.4.3",
        "minimatch": "^11.0.1",
        "semver": "^7.7.3",
        "tinyglobby": "^0.2.15",
        "ts-api-utils": "^2.5.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "@typescript/native": "npm:typescript@>=7.1.0-dev.20261009.1 || >=7.1.0-beta <7.1.0-dev",
        "typescript": ">=4.8.4 <6.1.0"
      },
      "peerDependenciesMeta": {
        "@typescript/native": {
          "optional": true
        }
      }
    }
  },
  {
    "path": "node_modules/@typescript-eslint/typescript-estree/node_modules/brace-expansion",
    "before": {
      "version": "5.0.12",
      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.12.tgz",
      "integrity": "sha512-YovQ3rzhaLMIrDjNDMkNS01tea93qhEhG5xy8f6+R0l+dw3Ki+5sCoIoI942iuLZTHWogWktgwVDhU09iNEimQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "balanced-match": "^4.0.2"
      },
      "engines": {
        "node": "20 || >=22"
      }
    },
    "after": {
      "version": "5.1.0",
      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.1.0.tgz",
      "integrity": "sha512-aa11Dv491GKnYqxaul3aRJ0szew7yMJMfZPnqD44NjGrZXoj62l41OEDDpdpC4eE2P88vBFfLuSyRhpG91NUvg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "balanced-match": "^4.0.2"
      },
      "engines": {
        "node": "20 || >=22"
      }
    }
  },
  {
    "path": "node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch",
    "before": {
      "version": "10.2.4",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-10.2.4.tgz",
      "integrity": "sha512-oRjTw/97aTBN0RHbYCdtF1MQfvusSIBQM0IZEgzl6426+8jSC0nF1a/GmnVLpfB9yyr6g6FTqWqiZVbxrtaCIg==",
      "dev": true,
      "license": "BlueOak-1.0.0",
      "dependencies": {
        "brace-expansion": "^5.0.2"
      },
      "engines": {
        "node": "18 || 20 || >=22"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    },
    "after": {
      "version": "11.0.9",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-11.0.9.tgz",
      "integrity": "sha512-KCFkfyjqerNlSstjlhIGNXIKZGA/6O4V4RlhZ+Dsr621SPPw0mzlypE9D9ZOoPiVefHID+j7/XuMMlqfD/F60Q==",
      "dev": true,
      "license": "BlueOak-1.0.0",
      "dependencies": {
        "@isaacs/nonrecursive-glob-match": "^1.1.0",
        "brace-expansion": "^5.0.12"
      },
      "engines": {
        "node": "20 || >=22"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    }
  },
  {
    "path": "node_modules/@typescript-eslint/typescript-estree/node_modules/semver",
    "before": {
      "version": "7.7.4",
      "resolved": "https://registry.npmjs.org/semver/-/semver-7.7.4.tgz",
      "integrity": "sha512-vFKC2IEtQnVhpT78h1Yp8wzwrf8CM+MzKMHGJZfBtzhZNycRFnXsHk6E5TxIkkMsgNS7mdX3AGB7x2QM2di4lA==",
      "dev": true,
      "license": "ISC",
      "bin": {
        "semver": "bin/semver.js"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "after": {
      "version": "7.8.6",
      "resolved": "https://registry.npmjs.org/semver/-/semver-7.8.6.tgz",
      "integrity": "sha512-9lpSSU4Mly3mrtruwLs1eLK6+gzbzqeBFwRNjIjE+9LuDpWdYctrQlQ3ej1Ilgi7gknpsTRnPoLP8DpCHqHIJw==",
      "dev": true,
      "license": "ISC",
      "bin": {
        "semver": "bin/semver.js"
      },
      "engines": {
        "node": ">=10"
      }
    }
  },
  {
    "path": "node_modules/@typescript-eslint/utils",
    "before": {
      "version": "8.57.1",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/utils/-/utils-8.57.1.tgz",
      "integrity": "sha512-XUNSJ/lEVFttPMMoDVA2r2bwrl8/oPx8cURtczkSEswY5T3AeLmCy+EKWQNdL4u0MmAHOjcWrqJp2cdvgjn8dQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@eslint-community/eslint-utils": "^4.9.1",
        "@typescript-eslint/scope-manager": "8.57.1",
        "@typescript-eslint/types": "8.57.1",
        "@typescript-eslint/typescript-estree": "8.57.1"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
        "typescript": ">=4.8.4 <6.0.0"
      }
    },
    "after": {
      "version": "8.74.0",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/utils/-/utils-8.74.0.tgz",
      "integrity": "sha512-IpWXPxXXomzxyTcvjhZJexgdvtTR1TooLAPpuxzaGqQ8BHll1lf4Ysp/BTE/l0U5TJ+x1j7B4bEM8pLRrvY+XA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@eslint-community/eslint-utils": "^4.9.1",
        "@typescript-eslint/scope-manager": "8.74.0",
        "@typescript-eslint/types": "8.74.0",
        "@typescript-eslint/typescript-estree": "8.74.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
        "typescript": ">=4.8.4 <6.1.0"
      }
    }
  },
  {
    "path": "node_modules/@typescript-eslint/visitor-keys",
    "before": {
      "version": "8.57.1",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/visitor-keys/-/visitor-keys-8.57.1.tgz",
      "integrity": "sha512-YWnmJkXbofiz9KbnbbwuA2rpGkFPLbAIetcCNO6mJ8gdhdZ/v7WDXsoGFAJuM6ikUFKTlSQnjWnVO4ux+UzS6A==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/types": "8.57.1",
        "eslint-visitor-keys": "^5.0.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      }
    },
    "after": {
      "version": "8.74.0",
      "resolved": "https://registry.npmjs.org/@typescript-eslint/visitor-keys/-/visitor-keys-8.74.0.tgz",
      "integrity": "sha512-XSZmOtMUbWCBIM+2BK134FyMFxmll1mW2mPLk/PSwYQYzGIPMgJAqL929U4qXVizLv7Xq5b7r41/o7Ombuwk0g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/types": "8.74.0",
        "eslint-visitor-keys": "^5.0.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      }
    }
  },
  {
    "path": "node_modules/baseline-browser-mapping",
    "before": {
      "version": "2.11.33",
      "resolved": "https://registry.npmjs.org/baseline-browser-mapping/-/baseline-browser-mapping-2.11.33.tgz",
      "integrity": "sha512-yiVKDX+qCMRKBE084lXvq9EcwFUhKZ2nU8TK1EQQuOgPNR/lmbGxXOeDdlGUqC2Zz11Cs9rk1d/8NfgBmlkt0w==",
      "license": "Apache-2.0",
      "bin": {
        "baseline-browser-mapping": "dist/cli.cjs"
      },
      "engines": {
        "node": ">=6.0.0"
      }
    },
    "after": {
      "version": "2.11.39",
      "resolved": "https://registry.npmjs.org/baseline-browser-mapping/-/baseline-browser-mapping-2.11.39.tgz",
      "integrity": "sha512-Q9buOYhr2ggrEZpImICecZTJHCCd8yXkRUokFlUEQ8uiD6oP82F4W4jWnhOHZYV+wlvrC51V7Wy0ULyWjil5Wg==",
      "license": "Apache-2.0",
      "bin": {
        "baseline-browser-mapping": "dist/cli.cjs"
      },
      "engines": {
        "node": ">=6.0.0"
      }
    }
  },
  {
    "path": "node_modules/browserslist",
    "before": {
      "version": "4.29.4",
      "resolved": "https://registry.npmjs.org/browserslist/-/browserslist-4.29.4.tgz",
      "integrity": "sha512-2TcbbiwXEq+N0kD36tykpCfyyQigUXmuwNQbnPp4Xk4PX9JOqVIKjJlIDjpH7uY6tmRGoAd+apeT1p60T8wsdA==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/browserslist"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/browserslist"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "baseline-browser-mapping": "^2.11.29",
        "caniuse-lite": "^1.0.30001816",
        "electron-to-chromium": "^1.5.459",
        "node-releases": "^2.0.59",
        "update-browserslist-db": "^1.3.4"
      },
      "bin": {
        "browserslist": "cli.js"
      },
      "engines": {
        "node": "^6 || ^7 || ^8 || ^9 || ^10 || ^11 || ^12 || >=13.7"
      }
    },
    "after": {
      "version": "4.29.6",
      "resolved": "https://registry.npmjs.org/browserslist/-/browserslist-4.29.6.tgz",
      "integrity": "sha512-CmVVIQ3RVc5HxYEc9X84GvxK/C8C1wH8TlKAiO7uTxF8PDwt7r8t9Qk3J9NkMOVzX5O/HbLv3yzxZg9HPrnI9w==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/browserslist"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/browserslist"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "baseline-browser-mapping": "^2.11.37",
        "caniuse-lite": "^1.0.30001826",
        "electron-to-chromium": "^1.5.486",
        "node-releases": "^2.0.64",
        "update-browserslist-db": "^1.4.0"
      },
      "bin": {
        "browserslist": "cli.js"
      },
      "engines": {
        "node": "^6 || ^7 || ^8 || ^9 || ^10 || ^11 || ^12 || >=13.7"
      }
    }
  },
  {
    "path": "node_modules/caniuse-lite",
    "before": {
      "version": "1.0.30001819",
      "resolved": "https://registry.npmjs.org/caniuse-lite/-/caniuse-lite-1.0.30001819.tgz",
      "integrity": "sha512-LFUqIIAwpzsIuevnKnsR9qnStBcgzPShTX61lBwN9uFkkf8o8zLiebEjbW8AYtZiF+1YKDWfdt/pWDtMuG8Xwg==",
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/browserslist"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/caniuse-lite"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "CC-BY-4.0"
    },
    "after": {
      "version": "1.0.30001828",
      "resolved": "https://registry.npmjs.org/caniuse-lite/-/caniuse-lite-1.0.30001828.tgz",
      "integrity": "sha512-7MWeT+3DlrpuDybTWHl4Zb1Z80Z1fLLnOXuBjDXebzDVcqnEWUlV8JcbASg8B8BhcW8QT2UiR1KAtzYFIZHZYA==",
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/browserslist"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/caniuse-lite"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "CC-BY-4.0"
    }
  },
  {
    "path": "node_modules/electron-to-chromium",
    "before": {
      "version": "1.5.464",
      "resolved": "https://registry.npmjs.org/electron-to-chromium/-/electron-to-chromium-1.5.464.tgz",
      "integrity": "sha512-nRa65aFge40viPAKxMKULIY8tcXKwKboJWNn4RoKwyWXJ6SP7BnrDGKUTzc64818jIciH0PK7LSF8QzZes19GA==",
      "dev": true,
      "license": "ISC"
    },
    "after": {
      "version": "1.5.494",
      "resolved": "https://registry.npmjs.org/electron-to-chromium/-/electron-to-chromium-1.5.494.tgz",
      "integrity": "sha512-Tph7ohL4Xc0ft3DXElYEIVTmPI3H0MtPCTdgtz5AwWGZG6q+vMiT3IzJ3RJX/HJQ8pYzeimQyvi6SsBTOS0nyQ==",
      "dev": true,
      "license": "ISC"
    }
  },
  {
    "path": "node_modules/eslint-config-next",
    "before": {
      "version": "16.1.7",
      "resolved": "https://registry.npmjs.org/eslint-config-next/-/eslint-config-next-16.1.7.tgz",
      "integrity": "sha512-FTq1i/QDltzq+zf9aB/cKWAiZ77baG0V7h8dRQh3thVx7I4dwr6ZXQrWKAaTB7x5VwVXlzoUTyMLIVQPLj2gJg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@next/eslint-plugin-next": "16.1.7",
        "eslint-import-resolver-node": "^0.3.6",
        "eslint-import-resolver-typescript": "^3.5.2",
        "eslint-plugin-import": "^2.32.0",
        "eslint-plugin-jsx-a11y": "^6.10.0",
        "eslint-plugin-react": "^7.37.0",
        "eslint-plugin-react-hooks": "^7.0.0",
        "globals": "16.4.0",
        "typescript-eslint": "^8.46.0"
      },
      "peerDependencies": {
        "eslint": ">=9.0.0",
        "typescript": ">=3.3.1"
      },
      "peerDependenciesMeta": {
        "typescript": {
          "optional": true
        }
      }
    },
    "after": {
      "version": "16.4.6",
      "resolved": "https://registry.npmjs.org/eslint-config-next/-/eslint-config-next-16.4.6.tgz",
      "integrity": "sha512-IBGGrVf9E6pL0NGL0hmeicVGeSyv1VEzIWq6IecDqkw+YFByhEtDJS9u1r6s6a1VxK6rssh69KyNFQUgfaacqw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@next/eslint-plugin-next": "16.4.6",
        "eslint-import-resolver-node": "^0.3.6",
        "eslint-import-resolver-typescript": "^3.5.2",
        "eslint-plugin-import": "^2.32.0",
        "eslint-plugin-jsx-a11y": "^6.10.0",
        "eslint-plugin-react": "^7.37.0",
        "eslint-plugin-react-hooks": "^7.1.0",
        "globals": "16.4.0",
        "typescript-eslint": "^8.56.0"
      },
      "peerDependencies": {
        "eslint": ">=9.0.0",
        "typescript": ">=3.3.1"
      },
      "peerDependenciesMeta": {
        "typescript": {
          "optional": true
        }
      }
    }
  },
  {
    "path": "node_modules/eslint-plugin-react-hooks",
    "before": {
      "version": "7.0.1",
      "resolved": "https://registry.npmjs.org/eslint-plugin-react-hooks/-/eslint-plugin-react-hooks-7.0.1.tgz",
      "integrity": "sha512-O0d0m04evaNzEPoSW+59Mezf8Qt0InfgGIBJnpC0h3NH/WjUAR7BIKUfysC6todmtiZ/A0oUVS8Gce0WhBrHsA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/core": "^7.24.4",
        "@babel/parser": "^7.24.4",
        "hermes-parser": "^0.25.1",
        "zod": "^3.25.0 || ^4.0.0",
        "zod-validation-error": "^3.5.0 || ^4.0.0"
      },
      "engines": {
        "node": ">=18"
      },
      "peerDependencies": {
        "eslint": "^3.0.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0-0 || ^9.0.0"
      }
    },
    "after": {
      "version": "7.1.1",
      "resolved": "https://registry.npmjs.org/eslint-plugin-react-hooks/-/eslint-plugin-react-hooks-7.1.1.tgz",
      "integrity": "sha512-f2I7Gw6JbvCexzIInuSbZpfdQ44D7iqdWX01FKLvrPgqxoE7oMj8clOfto8U6vYiz4yd5oKu39rRSVOe1zRu0g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/core": "^7.24.4",
        "@babel/parser": "^7.24.4",
        "hermes-parser": "^0.25.1",
        "zod": "^3.25.0 || ^4.0.0",
        "zod-validation-error": "^3.5.0 || ^4.0.0"
      },
      "engines": {
        "node": ">=18"
      },
      "peerDependencies": {
        "eslint": "^3.0.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0-0 || ^9.0.0 || ^10.0.0"
      }
    }
  },
  {
    "path": "node_modules/next",
    "before": {
      "version": "16.4.3",
      "resolved": "https://registry.npmjs.org/next/-/next-16.4.3.tgz",
      "integrity": "sha512-OqxKTGi9u80FydydsMNYNjnuje9Au+kvHlt2GZ//ftdpDHm1dxKqAaENoOOTX5wKzn+9vaKUNIfZeyZUuLhCnA==",
      "license": "MIT",
      "dependencies": {
        "@next/env": "16.4.3",
        "@swc/helpers": "0.5.23",
        "baseline-browser-mapping": "^2.9.19",
        "caniuse-lite": "^1.0.30001579",
        "postcss": "8.5.23",
        "styled-jsx": "5.1.6"
      },
      "bin": {
        "next": "dist/bin/next"
      },
      "engines": {
        "node": ">=20.9.0"
      },
      "optionalDependencies": {
        "@next/swc-darwin-arm64": "16.4.3",
        "@next/swc-darwin-x64": "16.4.3",
        "@next/swc-linux-arm64-gnu": "16.4.3",
        "@next/swc-linux-arm64-musl": "16.4.3",
        "@next/swc-linux-x64-gnu": "16.4.3",
        "@next/swc-linux-x64-musl": "16.4.3",
        "@next/swc-win32-arm64-msvc": "16.4.3",
        "@next/swc-win32-x64-msvc": "16.4.3",
        "sharp": "^0.35.5"
      },
      "peerDependencies": {
        "@opentelemetry/api": "^1.1.0",
        "@playwright/test": "^1.51.1",
        "babel-plugin-react-compiler": "*",
        "react": "^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0",
        "react-dom": "^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0",
        "sass": "^1.3.0"
      },
      "peerDependenciesMeta": {
        "@opentelemetry/api": {
          "optional": true
        },
        "@playwright/test": {
          "optional": true
        },
        "babel-plugin-react-compiler": {
          "optional": true
        },
        "sass": {
          "optional": true
        }
      }
    },
    "after": {
      "version": "16.4.6",
      "resolved": "https://registry.npmjs.org/next/-/next-16.4.6.tgz",
      "integrity": "sha512-QZJiYhaZLJMo2KpkQGQIwvmd79WVsAWeYIU554a8d7zArS3si/IRy3lBNV/rtYhE70oLwdLYhPAXLPx8HwcwtA==",
      "license": "MIT",
      "dependencies": {
        "@next/env": "16.4.6",
        "@swc/helpers": "0.5.23",
        "baseline-browser-mapping": "^2.9.19",
        "caniuse-lite": "^1.0.30001579",
        "postcss": "8.5.23",
        "styled-jsx": "5.1.6"
      },
      "bin": {
        "next": "dist/bin/next"
      },
      "engines": {
        "node": ">=20.9.0"
      },
      "optionalDependencies": {
        "@next/swc-darwin-arm64": "16.4.6",
        "@next/swc-darwin-x64": "16.4.6",
        "@next/swc-linux-arm64-gnu": "16.4.6",
        "@next/swc-linux-arm64-musl": "16.4.6",
        "@next/swc-linux-x64-gnu": "16.4.6",
        "@next/swc-linux-x64-musl": "16.4.6",
        "@next/swc-win32-arm64-msvc": "16.4.6",
        "@next/swc-win32-x64-msvc": "16.4.6",
        "sharp": "^0.35.5"
      },
      "peerDependencies": {
        "@opentelemetry/api": "^1.1.0",
        "@playwright/test": "^1.51.1",
        "babel-plugin-react-compiler": "*",
        "react": "^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0",
        "react-dom": "^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0",
        "sass": "^1.3.0"
      },
      "peerDependenciesMeta": {
        "@opentelemetry/api": {
          "optional": true
        },
        "@playwright/test": {
          "optional": true
        },
        "babel-plugin-react-compiler": {
          "optional": true
        },
        "sass": {
          "optional": true
        }
      }
    }
  },
  {
    "path": "node_modules/node-releases",
    "before": {
      "version": "2.0.60",
      "resolved": "https://registry.npmjs.org/node-releases/-/node-releases-2.0.60.tgz",
      "integrity": "sha512-OmO8+GM1JUZqXET720VrJCwkjUCXmCMQm0Z3UDDRbfNLHS4NEAvY60j5jiFv0tkKw2PNNlqOLhahVmwJIOLDIQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18"
      }
    },
    "after": {
      "version": "2.0.66",
      "resolved": "https://registry.npmjs.org/node-releases/-/node-releases-2.0.66.tgz",
      "integrity": "sha512-uSMWN9/XtWzxaE0d9ZNHe00Hda6028AXH3WRjTsK71neiPCSeL5nGSD9MXTQX/6Qx0k7Op1AyyinmIUw9fBzrg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18"
      }
    }
  },
  {
    "path": "node_modules/ts-api-utils",
    "before": {
      "version": "2.4.0",
      "resolved": "https://registry.npmjs.org/ts-api-utils/-/ts-api-utils-2.4.0.tgz",
      "integrity": "sha512-3TaVTaAv2gTiMB35i3FiGJaRfwb3Pyn/j3m/bfAvGe8FB7CF6u+LMYqYlDh7reQf7UNvoTvdfAqHGmPGOSsPmA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18.12"
      },
      "peerDependencies": {
        "typescript": ">=4.8.4"
      }
    },
    "after": {
      "version": "2.5.0",
      "resolved": "https://registry.npmjs.org/ts-api-utils/-/ts-api-utils-2.5.0.tgz",
      "integrity": "sha512-OJ/ibxhPlqrMM0UiNHJ/0CKQkoKF243/AEmplt3qpRgkW8VG7IfOS41h7V8TjITqdByHzrjcS/2si+y4lIh8NA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18.12"
      },
      "peerDependencies": {
        "typescript": ">=4.8.4"
      }
    }
  },
  {
    "path": "node_modules/typescript-eslint",
    "before": {
      "version": "8.57.1",
      "resolved": "https://registry.npmjs.org/typescript-eslint/-/typescript-eslint-8.57.1.tgz",
      "integrity": "sha512-fLvZWf+cAGw3tqMCYzGIU6yR8K+Y9NT2z23RwOjlNFF2HwSB3KhdEFI5lSBv8tNmFkkBShSjsCjzx1vahZfISA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/eslint-plugin": "8.57.1",
        "@typescript-eslint/parser": "8.57.1",
        "@typescript-eslint/typescript-estree": "8.57.1",
        "@typescript-eslint/utils": "8.57.1"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
        "typescript": ">=4.8.4 <6.0.0"
      }
    },
    "after": {
      "version": "8.74.0",
      "resolved": "https://registry.npmjs.org/typescript-eslint/-/typescript-eslint-8.74.0.tgz",
      "integrity": "sha512-OsWQlsedt1ZpZXfZZMNK3m4SoQONFFcy4h/uRznsCeRfVuEic3gh4KGUs2pJJ5o0Jj0Jr7keUHQGN1Ns9aDw7Q==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@typescript-eslint/eslint-plugin": "8.74.0",
        "@typescript-eslint/parser": "8.74.0",
        "@typescript-eslint/typescript-estree": "8.74.0",
        "@typescript-eslint/utils": "8.74.0"
      },
      "engines": {
        "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/typescript-eslint"
      },
      "peerDependencies": {
        "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
        "typescript": ">=4.8.4 <6.1.0"
      }
    }
  },
  {
    "path": "node_modules/update-browserslist-db",
    "before": {
      "version": "1.3.4",
      "resolved": "https://registry.npmjs.org/update-browserslist-db/-/update-browserslist-db-1.3.4.tgz",
      "integrity": "sha512-t8wonIOdQyOjtPd2VktlBu6QjTVTks6v8bSi7kd0r2Vll8TK1JYDZtRRdbmCHOAMphkZgrzK+L+vXK4pyZ8t4A==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/browserslist"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/browserslist"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "escalade": "^3.2.0",
        "picocolors": "^1.1.1"
      },
      "bin": {
        "update-browserslist-db": "cli.js"
      },
      "peerDependencies": {
        "browserslist": ">= 4.21.0"
      }
    },
    "after": {
      "version": "1.4.0",
      "resolved": "https://registry.npmjs.org/update-browserslist-db/-/update-browserslist-db-1.4.0.tgz",
      "integrity": "sha512-WPJuOnjI9FWDct4fB+ej4Mz8opLaw5CDcZ2t44tFZ0vIQVYWzBhWR3mkixuUj/A7+vY4V9+ApOZ2YYLwdgq46w==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/browserslist"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/browserslist"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "escalade": "^3.2.0",
        "picocolors": "^1.1.1"
      },
      "bin": {
        "update-browserslist-db": "cli.js"
      },
      "peerDependencies": {
        "browserslist": ">= 4.21.0"
      }
    }
  },
  {
    "path": "node_modules/@isaacs/nonrecursive-glob-match",
    "before": null,
    "after": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/@isaacs/nonrecursive-glob-match/-/nonrecursive-glob-match-1.1.0.tgz",
      "integrity": "sha512-GPm/Dbvk5RLmhRnxXIa7nTpK0xtl4E0wj0MslsuNiJ1FIROU+2+9lgUC/dgF7Ey4QCWhfEsgxilMRMCdHPfDfw==",
      "dev": true,
      "license": "BlueOak-1.0.0"
    }
  }
];
export function restoreSecurityLock(lock) { const result=structuredClone(lock);for(const delta of securityLockDeltas){assert.deepEqual(result.packages[delta.path]??null,delta.after,"Reviewed dependency entry: "+delta.path);if(delta.before===null)delete result.packages[delta.path];else result.packages[delta.path]=structuredClone(delta.before);}return result;}
export function restoreSecurityPackage(pkg){const result=structuredClone(pkg);assert.equal(result.dependencies.next,"16.4.6");assert.equal(result.devDependencies["eslint-config-next"],"16.4.6");assert.equal(result.scripts["test:postgres"],"node --import tsx scripts/postgres-acceptance.ts");result.dependencies.next="^16.4.3";result.devDependencies["eslint-config-next"]="^16.1.7";delete result.scripts["test:postgres"];return result;}
