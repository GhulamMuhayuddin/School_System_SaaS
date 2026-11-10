/*
  Warnings:

  - A unique constraint covering the columns `[student_id]` on the table `hostel_allocations` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "hostel_allocations_student_id_key" ON "hostel_allocations"("student_id");
