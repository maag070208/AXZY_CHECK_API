import { transporter } from "./src/core/config/mail";

async function main() {
    try {
        await transporter.sendMail({
            from: "aamaro@axzy.dev",
            to: "aamaro@axzy.dev", // send to self
            subject: "Test email",
            html: "<p>Test</p>"
        });
        console.log("Success");
    } catch (e) {
        console.error("Error:", e);
    }
}
main();
