/** 展示按实际秒数扣除的天数，保留小数，避免不足一天的扣除被显示为零天。 */
export const formatDeductDays = (seconds: number) => (seconds / 86400).toFixed(6).replace(/\.?0+$/, '')
