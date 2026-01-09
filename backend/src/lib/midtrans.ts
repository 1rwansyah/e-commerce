import midtransClient from "midtrans-client";

const snap = new midtransClient.Snap({
  isProduction: false, // sandbox
  serverKey: process.env.MIDTRANS_SERVER_KEY!,
  clientKey: process.env.MIDTRANS_CLIENT_KEY!, // ✅ WAJIB
});

export default snap;
