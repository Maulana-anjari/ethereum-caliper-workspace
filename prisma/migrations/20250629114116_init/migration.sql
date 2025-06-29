-- CreateTable
CREATE TABLE "ExperimentResult" (
    "id" SERIAL NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "trialNumber" INTEGER NOT NULL,
    "consensus" TEXT NOT NULL,
    "topology" TEXT NOT NULL,
    "blockTime" INTEGER NOT NULL,
    "blockGasLimit" BIGINT NOT NULL,
    "rateController" TEXT NOT NULL,
    "targetTPS" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "workload" TEXT NOT NULL,
    "workers" INTEGER NOT NULL,
    "throughput" DOUBLE PRECISION NOT NULL,
    "avgLatency" DOUBLE PRECISION NOT NULL,
    "minLatency" DOUBLE PRECISION NOT NULL,
    "maxLatency" DOUBLE PRECISION NOT NULL,
    "success" INTEGER NOT NULL,
    "fail" INTEGER NOT NULL,
    "avgCPU" DOUBLE PRECISION,
    "maxMemory" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentResult_pkey" PRIMARY KEY ("id")
);
