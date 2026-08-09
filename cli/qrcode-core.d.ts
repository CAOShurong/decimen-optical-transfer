declare module "qrcode/lib/core/qrcode.js" {
  import type { QRCode, QRCodeOptions, QRCodeSegment } from "qrcode";

  const core: {
    create(data: string | QRCodeSegment[], options?: QRCodeOptions): QRCode;
  };

  export default core;
}
