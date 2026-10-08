# kikyo:notebook v=1
# kikyo:cell id=c86b197ee
print("I am working in kikyo")

# kikyo:cell id=cz7wwbr
pip install pandas

# kikyo:cell id=cjwheb1
import pandas as pd

# Create a DataFrame
data = {
    "Name": ["Saif", "Ali", "John", "Aisha", "Rahul"],
    "Age": [24, 28, 22, 26, 30],
    "City": ["Delhi", "Mumbai", "Delhi", "Bangalore", "Pune"],
    "Salary": [50000, 75000, 45000, 80000, 65000]
}

df = pd.DataFrame(data)

print(df)

# kikyo:cell id=cc1atzm
import pandas as pd

# --------------------------------------------------
# Sales Data
# --------------------------------------------------

data = {
    "Order_ID": [1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008],
    "Customer": [
        "Aarav", "Priya", "Rahul", "Aisha",
        "Kabir", "Neha", "Arjun", "Sara"
    ],
    "Product": [
        "Laptop", "Phone", "Tablet", "Laptop",
        "Headphones", "Phone", "Monitor", "Tablet"
    ],
    "Category": [
        "Electronics", "Electronics", "Electronics", "Electronics",
        "Accessories", "Electronics", "Electronics", "Electronics"
    ],
    "Quantity": [1, 2, 1, 2, 3, 1, 2, 2],
    "Price": [75000, 45000, 30000, 80000, 3000, 50000, 22000, 28000],
    "City": [
        "Delhi", "Mumbai", "Delhi", "Bangalore",
        "Pune", "Mumbai", "Delhi", "Bangalore"
    ]
}

df = pd.DataFrame(data)

# Calculate total revenue
df["Revenue"] = df["Quantity"] * df["Price"]

# Display the complete table
print(df.to_string(index=False))

# --------------------------------------------------
# Analysis
# --------------------------------------------------

print("\n--- Top Orders ---")

top_orders = df.sort_values(
    "Revenue",
    ascending=False
)

print(
    top_orders[
        ["Order_ID", "Customer", "Product", "Revenue"]
    ].to_string(index=False)
)

# Orders above ₹50,000
print("\n--- Orders Above ₹50,000 ---")

high_value = df[df["Revenue"] > 50000]

print(
    high_value[
        ["Customer", "Product", "City", "Revenue"]
    ].to_string(index=False)
)

# Revenue by city
print("\n--- Revenue By City ---")

city_revenue = (
    df.groupby("City")["Revenue"]
      .sum()
      .sort_values(ascending=False)
)

print(city_revenue)

# Overall statistics
print("\n--- Summary ---")

print(f"Total Revenue: ₹{df['Revenue'].sum():,}")
print(f"Average Order Value: ₹{df['Revenue'].mean():,.2f}")
print(f"Total Orders: {len(df)}")

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
