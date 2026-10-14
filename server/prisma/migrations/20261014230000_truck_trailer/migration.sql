-- Truck pack (alpha): drawbar trailers
ALTER TABLE "TruckVehicle" ADD COLUMN "trailerLengthMm" INTEGER;
ALTER TABLE "TruckVehicle" ADD COLUMN "trailerWidthMm" INTEGER;
ALTER TABLE "TruckVehicle" ADD COLUMN "trailerHeightMm" INTEGER;
