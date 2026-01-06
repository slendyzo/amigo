declare module 'ofx-js' {
  interface OFXData {
    header: Record<string, string>;
    OFX?: {
      BANKMSGSRSV1?: {
        STMTTRNRS?: {
          STMTRS?: {
            CURDEF?: string;
            BANKTRANLIST?: {
              STMTTRN?: OFXTransaction[];
            };
          };
        };
      };
      CREDITCARDMSGSRSV1?: {
        CCSTMTTRNRS?: {
          CCSTMTRS?: {
            CURDEF?: string;
            BANKTRANLIST?: {
              STMTTRN?: OFXTransaction[];
            };
          };
        };
      };
    };
  }

  interface OFXTransaction {
    TRNTYPE: string;
    DTPOSTED: string;
    TRNAMT: string;
    FITID: string;
    NAME?: string;
    MEMO?: string;
  }

  export function parse(ofxContent: string): Promise<OFXData>;
}
