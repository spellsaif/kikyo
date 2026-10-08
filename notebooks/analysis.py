# kikyo:notebook v=1
# kikyo:cell id=c86b197ee
print("I am working in kikyo")

# kikyo:cell id=c3ax8gt
import numpy as np
import matplotlib.pyplot as plt

# Data
months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
sales = np.array([120, 150, 135, 180, 210, 245])
users = np.array([80, 95, 110, 125, 160, 190])

# Create figure
fig, ax = plt.subplots(figsize=(9, 5))

# Plot
ax.plot(
    months,
    sales,
    marker="o",
    linewidth=3,
    label="Sales"
)

ax.plot(
    months,
    users,
    marker="o",
    linewidth=3,
    label="Users"
)

# Fill area under sales
ax.fill_between(
    months,
    sales,
    alpha=0.12
)

# Titles
ax.set_title(
    "Growth Overview",
    fontsize=20,
    fontweight="bold",
    pad=20
)

ax.set_xlabel("Month")
ax.set_ylabel("Count")

# Clean styling
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)

ax.grid(
    axis="y",
    linestyle="--",
    alpha=0.25
)

ax.legend(
    frameon=False
)

# Add values to sales points
for month, value in zip(months, sales):
    ax.annotate(
        str(value),
        (month, value),
        xytext=(0, 10),
        textcoords="offset points",
        ha="center",
        fontsize=9
    )

plt.tight_layout()
plt.show()
