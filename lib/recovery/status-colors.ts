const leadColors: Record<string, [string, string]> = {
  called: ["#ffe599", "#594300"], "not answered": ["#c3e7ef", "#164b59"], disconnected: ["#e2cff4", "#542b75"],
  "incoming call not available": ["#783f04", "#ffffff"], busy: ["#ead1f2", "#6a3277"], affirmed: ["#c4edbf", "#215c1b"],
  "call again": ["#f9cb9c", "#783f04"], "sold for 1000": ["#cf1515", "#ffffff"], "batch change when paid": ["#138c45", "#ffffff"],
  "batch change - will pay in next batch": ["#79551c", "#ffffff"], discount: ["#165bb0", "#ffffff"], misc: ["#7432b6", "#ffffff"],
  ca: ["#f4b8c1", "#7a1b30"], "pay after lms": ["#388a9e", "#ffffff"], "without gst": ["#c6e8c6", "#275a27"],
  "pay in instalments": ["#18d9ed", "#00434b"], "number does not exist": ["#dedede", "#333333"], "pay after training": ["#f9cbac", "#783719"],
  ignore: ["#914200", "#ffffff"], "talk to executive": ["#ead1ef", "#632574"], mpkd: ["#b61c27", "#ffffff"],
  "wrong number": ["#e7e7e7", "#333333"], "swt off": ["#9463b5", "#ffffff"],
};
export function statusColors(field: "paymentStatus" | "leadStatus", value: string) {
  const key = value.trim().toLowerCase();
  const payment: Record<string, [string, string]> = { unpaid: ["#eeeeee", "#333333"], paid: ["#18e541", "#063d10"], default: ["#cf1525", "#ffffff"] };
  const [backgroundColor, color] = (field === "paymentStatus" ? payment[key] : leadColors[key]) || ["#e8e5f5", "#493b6f"];
  return { backgroundColor, color };
}
