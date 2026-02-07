import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Phỏm | Tính điểm",
  description: "Ứng dụng tính điểm Phỏm cho 4 người chơi"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
