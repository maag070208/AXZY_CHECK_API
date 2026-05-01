import { sendIncidentEmail } from "./src/core/utils/emailSender";

async function main() {
    try {
        const incident = {
            title: "Test Incident",
            category: { value: "Security" },
            description: "Test description",
            media: []
        };
        const guard = {
            name: "John",
            lastName: "Doe"
        };
        await sendIncidentEmail(incident, guard);
        console.log("sendIncidentEmail function completed");
    } catch (e) {
        console.error("Error calling sendIncidentEmail:", e);
    }
}
main();
