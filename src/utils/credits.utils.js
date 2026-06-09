const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const hasActiveProPlan = (user) => {
  return user.plan === "pro" && (!user.subscriptionExpiresAt || user.subscriptionExpiresAt > new Date());
};

const canCreateSnap = (user) => {
  return hasActiveProPlan(user) || user.snapCredits > 0;
};

const snapPacks = {
  1: { credits: 1, amount: 900 },
  10: { credits: 10, amount: 7900 },
  30: { credits: 30, amount: 19900 }
};

module.exports = { addDays, hasActiveProPlan, canCreateSnap, snapPacks };
