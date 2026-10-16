DO $$
DECLARE
  v_lat DOUBLE PRECISION := 6.2100;  -- Awka
  v_lng DOUBLE PRECISION := 7.0700;  -- Awka
  vid UUID; cid UUID; sid INT;
BEGIN
  INSERT INTO users (email,password_hash,name,phone,role,vendor_approved,email_verified_at)
  VALUES ('vendor@demo.conect', crypt('Demo12345', gen_salt('bf',10)), 'Demo Vendor','08000000001','vendor',true,now())
  ON CONFLICT (email) DO UPDATE SET vendor_approved=true RETURNING id INTO vid;

  INSERT INTO vendor_profiles (user_id,business_name,business_type,phone,address,government_id_status,food_safety_status,orientation_completed,orientation_completed_at)
  VALUES (vid,'Demo Kitchen','food','08000000001','1 Demo Street, Awka','approved','approved',true,now())
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO users (email,password_hash,name,phone,role,courier_approved,email_verified_at)
  VALUES ('rider@demo.conect', crypt('Demo12345', gen_salt('bf',10)), 'Demo Rider','08000000002','courier',true,now())
  ON CONFLICT (email) DO UPDATE SET courier_approved=true RETURNING id INTO cid;

  INSERT INTO courier_profiles (user_id,phone,address,vehicle_type,government_id_status,driving_license_status,vehicle_registration_status,orientation_completed,orientation_completed_at)
  VALUES (cid,'08000000002','2 Demo Street, Awka','motorcycle','approved','approved','approved',true,now())
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO users (email,password_hash,name,phone,role,email_verified_at)
  VALUES ('customer@demo.conect', crypt('Demo12345', gen_salt('bf',10)), 'Demo Customer','08000000003','customer',now())
  ON CONFLICT (email) DO NOTHING;

  SELECT id INTO sid FROM stores WHERE name='Demo Kitchen';
  IF sid IS NULL THEN
    INSERT INTO stores (name,category,emoji,eta_minutes,delivery_fee,lat,lng,vendor_id)
    VALUES ('Demo Kitchen','food','🍛',25,500,v_lat,v_lng,vid) RETURNING id INTO sid;
    INSERT INTO products (store_id,name,price) VALUES
      (sid,'Jollof rice & chicken',3500),
      (sid,'Fried rice & turkey',4000),
      (sid,'Suya wrap',2500),
      (sid,'Chapman',1500),
      (sid,'Zobo drink',800);
  END IF;
END $$;
