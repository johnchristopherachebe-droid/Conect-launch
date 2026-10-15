-- Prices are in naira (NGN).
INSERT INTO stores (name, category, emoji, eta_minutes, delivery_fee, lat, lng)
SELECT v.name,v.category,v.emoji,v.eta_minutes,v.delivery_fee,v.lat,v.lng
FROM (VALUES
 ('Casa Pepa','food','🍕',25,500,6.5244,3.3792),
 ('Sakura Roll','food','🍣',35,700,6.5300,3.3700),
 ('Burger Yard','food','🍔',20,400,6.5180,3.3850),
 ('FreshMart','groceries','🛒',30,500,6.5260,3.3760),
 ('Farmacia Sol','pharmacy','💊',25,700,6.5220,3.3820)
) AS v(name,category,emoji,eta_minutes,delivery_fee,lat,lng)
WHERE NOT EXISTS (SELECT 1 FROM stores s WHERE s.name=v.name);

INSERT INTO products (store_id, name, price)
SELECT s.id, p.name, p.price FROM stores s JOIN (VALUES
 ('Casa Pepa','Margherita',4500),('Casa Pepa','Pepperoni',5500),('Casa Pepa','Tiramisu',2500),
 ('Sakura Roll','Salmon nigiri x6',6000),('Sakura Roll','Dragon roll',7500),
 ('Burger Yard','Classic burger',4500),('Burger Yard','Fries',1800),
 ('FreshMart','Milk 1L',2500),('FreshMart','Eggs x12',3200),('FreshMart','Bread loaf',1800),
 ('Farmacia Sol','Pain relief',1500),('Farmacia Sol','Vitamin C',3500)
) AS p(store,name,price) ON p.store = s.name
WHERE NOT EXISTS (SELECT 1 FROM products);
