import wixData from 'wix-data';

$w.onReady(async () => {
  // Show dropdown and repeater
  $w("#billingCycleDropdown").show();
  $w("#planRepeater").show();
  $w("#discountBadgeimage").hide(); // This stays hidden unless shown per item

  // Load default cycle
  loadPlans("Monthly");

  // Handle dropdown change
  $w("#billingCycleDropdown").onChange(() => {
    const selected = $w("#billingCycleDropdown").value;
    $w("#planRepeater").data = []; // Clear old data
    loadPlans(selected);
  });
});

async function loadPlans(cycle) {
  const results = await wixData.query("PlanOptions")
    .ascending("sortOrder")
    .find();

  $w("#planRepeater").data = results.items;

  $w("#planRepeater").onItemReady(($item, itemData) => {
    const price = cycle === "Annual" ? itemData.annualPrice : itemData.monthlyPrice;
    const other = cycle === "Annual" ? itemData.monthlyPrice * 12 : itemData.annualPrice / 12;
    const savings = Math.round(((other - price) / other) * 100);

    $item("#planName").text = itemData.title;
    $item("#planDescription").text = itemData.description;
    $item("#planPrice").text = `R${price} / ${cycle}`;
    $item("#planImage").src = itemData.productImage;
    $item("#discountBadgeimage").src = itemData.image2;

    if (cycle === "Annual" && savings >= 5) {
      $item("#discountBadge").text = `Save ${savings}%`;
      $item("#discountBadge").show();
      $item("#discountBadgeimage").show();
    } else {
      $item("#discountBadge").hide();
      $item("#discountBadgeimage").hide();
    }
  });
}
