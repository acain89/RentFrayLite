-- CreateTable
CREATE TABLE "ManagerPushSubscription" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "endpointHash" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagerPushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushEvent" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "dispatchedAt" TIMESTAMP(3),

    CONSTRAINT "PushEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "PushDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManagerPushSubscription_endpointHash_key" ON "ManagerPushSubscription"("endpointHash");

-- CreateIndex
CREATE INDEX "ManagerPushSubscription_businessId_active_idx" ON "ManagerPushSubscription"("businessId", "active");

-- CreateIndex
CREATE INDEX "ManagerPushSubscription_sessionId_idx" ON "ManagerPushSubscription"("sessionId");

-- CreateIndex
CREATE INDEX "PushEvent_dispatchedAt_createdAt_idx" ON "PushEvent"("dispatchedAt", "createdAt");

-- CreateIndex
CREATE INDEX "PushEvent_businessId_createdAt_idx" ON "PushEvent"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "PushDelivery_status_nextAttemptAt_idx" ON "PushDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushDelivery_eventId_subscriptionId_key" ON "PushDelivery"("eventId", "subscriptionId");

-- AddForeignKey
ALTER TABLE "ManagerPushSubscription" ADD CONSTRAINT "ManagerPushSubscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerPushSubscription" ADD CONSTRAINT "ManagerPushSubscription_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushEvent" ADD CONSTRAINT "PushEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushEvent" ADD CONSTRAINT "PushEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDelivery" ADD CONSTRAINT "PushDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "PushEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDelivery" ADD CONSTRAINT "PushDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "ManagerPushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
