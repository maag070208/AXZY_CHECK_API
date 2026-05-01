// sendMessage.ts
import axios from "axios";
import { getConfig } from "./config";

export const sendMessage = async (
  to: string,
  templateName: string,
  languageCode: string = "en_US"
): Promise<void> => {
  let data = JSON.stringify({
    messaging_product: "whatsapp",
    to: to,
    type: "template",
    template: {
      name: templateName,
      language: {
        code: "en_US",
      },
    },
  });

  let config = {
    method: "post",
    maxBodyLength: Infinity,
    url: "https://graph.facebook.com/v19.0/360422453824188/messages",
    headers: {
      Authorization:
        "Bearer EAAWDaALmNmsBO75fJCUedtVEuteoZARJpT9VdoU906gAewZBsWb9bwDQshebKBzZA8pMzoBcm216mmNBNVwlixRWG9VDpXs36QRSXwLSTZBySUxWSKRb8tuUDMh4udxSTbtOSmOmhpIg7gVL1nwqGelnO94fZATLumxySKUpSbRePInXAkjn6Dygqz5wDIbGbPwwBQ8ptwuyUaZBs6Rdr5AOfk",
      "Content-Type": "application/json",
    },
    data: data,
  };

  axios
    .request(config)
    .then((response: any) => {
      console.log(JSON.stringify(response.data));
    })
    .catch((error: any) => {
      console.log(error);
    });

  // const payload = {
  //   messaging_product: "whatsapp",
  //   to: to,
  //   type: "template",
  //   template: {
  //     name: templateName,
  //     language: {
  //       code: languageCode,
  //     },
  //   },
  // };

  // const config = {
  //   method: "post",
  //   maxBodyLength: Infinity,
  //   url: getConfig("FACEBOOK_API_URL"),
  //   headers: {
  //     Authorization: `Bearer ${getConfig("FACEBOOK_ACCESS_TOKEN")}`,
  //     "Content-Type": "application/json",
  //   },
  //   data: payload,
  // };

  // console.log(`Sending message to ${to} using template ${templateName}`);

  // console.log({ config });

  // try {
  //   const response = await axios.request(config);
  //   console.log(`Message sent to ${to} using template ${templateName}`);
  //   console.log(JSON.stringify(response.data));
  // } catch (error: any) {
  //   console.error("Failed to send message:", error.message);
  // }
};
