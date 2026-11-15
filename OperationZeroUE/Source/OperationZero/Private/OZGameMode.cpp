#include "OZGameMode.h"
#include "OperationZero.h"
#include "OZCharacter.h"
#include "OZAIController.h"
#include "OZHUD.h"
#include "OZBlock.h"
#include "OZGrenade.h"
#include "OZEffects.h"
#include "OZSound.h"
#include "OZMapBuilder.h"
#include "EngineUtils.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"

static const TCHAR* BotNames[] = { TEXT("Lobo"), TEXT("Falcão"), TEXT("Tigre"), TEXT("Cobra"), TEXT("Raio"), TEXT("Trovão"), TEXT("Sombra"), TEXT("Coruja"), TEXT("Viper"), TEXT("Brasa"), TEXT("Jaguar"), TEXT("Corvo") };
static const FName Primaries[] = { "ar4", "kr47", "vespa", "mpx9", "breacher", "dmr14", "titan", "ar4" };

AOZGameMode::AOZGameMode()
{
	PrimaryActorTick.bCanEverTick = true;
	DefaultPawnClass = AOZCharacter::StaticClass();
	HUDClass = AOZHUD::StaticClass();
}

AOZGameMode* AOZGameMode::Get(const UObject* Ctx)
{
	UWorld* W = Ctx ? Ctx->GetWorld() : nullptr;
	return W ? W->GetAuthGameMode<AOZGameMode>() : nullptr;
}

TArray<AOZCharacter*> AOZGameMode::Characters(const UObject* Ctx)
{
	TArray<AOZCharacter*> Out;
	if (UWorld* W = Ctx ? Ctx->GetWorld() : nullptr) for (TActorIterator<AOZCharacter> It(W); It; ++It) Out.Add(*It);
	return Out;
}

void AOZGameMode::StartPlay()
{
	Super::StartPlay();
	FOZMapLayout Layout = AOZMapBuilder::BuildRefinery(GetWorld());
	Spawns[0] = Layout.Spawns[0]; Spawns[1] = Layout.Spawns[1]; StrategicPoints = Layout.Points;
	AOZEffects::Get(this);
	// jogador: equipe 0
	for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
	{
		APlayerController* PC = It->Get();
		if (!PC) continue;
		if (!PC->GetPawn()) RestartPlayer(PC);
		if (AOZCharacter* C = Cast<AOZCharacter>(PC->GetPawn()))
		{
			C->Team = 0; C->CallSign = TEXT("Você");
			C->SetTeamColors();
			C->Respawn(SpawnPointFor(0), 90.f);
		}
	}
	for (int32 i = 0; i < 4; i++) SpawnBot(0, i);
	for (int32 i = 0; i < 5; i++) SpawnBot(1, i + 4);
	UE_LOG(LogOZ, Log, TEXT("Operation Zero: partida iniciada (5x5)"));
}

void AOZGameMode::SpawnBot(int32 Team, int32 Index)
{
	const FVector P = SpawnPointFor(Team);
	const FTransform T(FRotator(0.f, Team == 0 ? 90.f : -90.f, 0.f), P);
	AOZCharacter* C = GetWorld()->SpawnActorDeferred<AOZCharacter>(AOZCharacter::StaticClass(), T, nullptr, nullptr, ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn);
	if (!C) return;
	C->Team = Team;
	C->CallSign = BotNames[Index % UE_ARRAY_COUNT(BotNames)];
	C->SetLoadout(Primaries[FMath::RandRange(0, UE_ARRAY_COUNT(Primaries) - 1)], "p9");
	C->AIControllerClass = AOZAIController::StaticClass();
	C->AutoPossessAI = EAutoPossessAI::Spawned;
	C->FinishSpawning(T);
}

FVector AOZGameMode::SpawnPointFor(int32 Team) const
{
	const TArray<FVector>& List = Spawns[FMath::Clamp(Team, 0, 1)];
	if (!List.Num()) return FVector(0, 0, 200);
	FVector Best = List[0]; float BestD = -1.f;
	const TArray<AOZCharacter*> All = Characters(this);
	for (const FVector& S : List)
	{
		float MinD = 1e9f;
		for (AOZCharacter* C : All) if (C->bAlive && C->Team != Team) MinD = FMath::Min(MinD, FVector::Dist2D(C->GetActorLocation(), S));
		MinD += FMath::FRand() * 800.f;
		if (MinD > BestD) { BestD = MinD; Best = S; }
	}
	return Best + FVector(FMath::FRandRange(-250.f, 250.f), FMath::FRandRange(-250.f, 250.f), 0.f);
}

void AOZGameMode::Tick(float Dt)
{
	Super::Tick(Dt);
	const float Now = GetWorld()->TimeSeconds;
	Noises.RemoveAll([Now](const FOZNoise& N) { return Now - N.Time > 0.4f; });
	if (KillFeed.Num() > 6) KillFeed.RemoveAt(0, KillFeed.Num() - 6);
	if (RadioLog.Num() > 4) RadioLog.RemoveAt(0, RadioLog.Num() - 4);
	if (bMatchOver)
	{
		EndTimer -= Dt;
		if (EndTimer <= 0.f) UGameplayStatics::OpenLevel(this, FName(*UGameplayStatics::GetCurrentLevelName(this)));
		return;
	}
	TimeLeft -= Dt;
	for (int32 i = Respawns.Num() - 1; i >= 0; i--)
	{
		Respawns[i].T -= Dt;
		if (Respawns[i].T > 0.f) continue;
		if (AOZCharacter* C = Respawns[i].C.Get()) C->Respawn(SpawnPointFor(C->Team), C->Team == 0 ? 90.f : -90.f);
		Respawns.RemoveAt(i);
	}
	if (TimeLeft <= 0.f || Scores[0] >= ScoreLimit || Scores[1] >= ScoreLimit)
	{
		bMatchOver = true; EndTimer = 10.f;
		WinnerTeam = Scores[0] > Scores[1] ? 0 : Scores[1] > Scores[0] ? 1 : -1;
	}
}

void AOZGameMode::OnKilled(AOZCharacter* Victim, AOZCharacter* Killer, FName WeaponId, bool bHeadshot, bool bExplosive, float Dist)
{
	if (Killer && Killer != Victim && Killer->Team != Victim->Team) Scores[Killer->Team]++;
	FOZKillEntry E;
	E.Killer = Killer ? Killer->CallSign : FString(); E.Victim = Victim->CallSign;
	E.Weapon = bExplosive ? TEXT("explosão") : OZWeapons::Get(WeaponId).DisplayName;
	if (WeaponId == "knife") E.Weapon = TEXT("faca");
	E.KillerTeam = Killer ? Killer->Team : -1; E.VictimTeam = Victim->Team; E.bHeadshot = bHeadshot;
	E.bKillerIsPlayer = Killer && Killer->IsPlayerControlled(); E.bVictimIsPlayer = Victim->IsPlayerControlled();
	E.Time = GetWorld()->TimeSeconds;
	KillFeed.Add(E);
	Respawns.Add({ Victim, 4.f });
	if (Killer && !Killer->IsPlayerControlled() && FMath::FRand() < 0.5f) Radio(Killer, TEXT("Alvo abatido!"));
}

void AOZGameMode::OnDamaged(AOZCharacter* Victim, AOZCharacter* Attacker)
{
	if (AOZAIController* AI = Cast<AOZAIController>(Victim->GetController())) AI->OnDamaged(Attacker);
}

void AOZGameMode::OnNearMiss(AOZCharacter* Victim, AOZCharacter* Shooter)
{
	if (AOZAIController* AI = Cast<AOZAIController>(Victim->GetController())) AI->OnNearMiss(Shooter);
}

void AOZGameMode::ReportNoise(const UObject* Ctx, const FVector& Location, float Radius, AOZCharacter* Source)
{
	if (AOZGameMode* GM = Get(Ctx))
	{
		FOZNoise N; N.Location = Location; N.Radius = Radius; N.Source = Source; N.Time = GM->GetWorld()->TimeSeconds;
		GM->Noises.Add(N);
	}
}

void AOZGameMode::OnGrenadeThrown(const UObject* Ctx, AOZGrenade* Grenade)
{
	if (AOZGameMode* GM = Get(Ctx)) GM->Grenades.Add(Grenade);
}

void AOZGameMode::ReportEnemy(int32 Team, AOZCharacter* Enemy, const FVector& Where, AOZCharacter* Reporter)
{
	if (Team < 0 || Team > 1) return;
	const float Now = GetWorld()->TimeSeconds;
	for (FKnown& K : Known[Team]) if (K.Enemy == Enemy)
	{
		const bool bFresh = Now - K.Time > 6.f;
		K.Pos = Where; K.Time = Now;
		if (bFresh && Reporter) Radio(Reporter, TEXT("Contato! Inimigo avistado!"));
		return;
	}
	Known[Team].Add({ Enemy, Where, Now });
	if (Reporter) Radio(Reporter, TEXT("Contato! Inimigo avistado!"));
}

bool AOZGameMode::KnownEnemy(int32 Team, FVector& OutPos, float MaxAge) const
{
	if (Team < 0 || Team > 1) return false;
	const float Now = GetWorld()->TimeSeconds;
	float Best = MaxAge;
	bool bAny = false;
	for (const FKnown& K : Known[Team])
	{
		if (!K.Enemy.IsValid() || !K.Enemy->bAlive) continue;
		const float Age = Now - K.Time;
		if (Age < Best) { Best = Age; OutPos = K.Pos; bAny = true; }
	}
	return bAny;
}

void AOZGameMode::Radio(AOZCharacter* From, const FString& Text, bool bImportant)
{
	// só a equipe do jogador ouve o rádio
	if (!From || From->Team != 0 || From->IsPlayerControlled()) return;
	const float Now = GetWorld()->TimeSeconds;
	if (Now - LastRadio < (bImportant ? 1.2f : 3.5f)) return;
	LastRadio = Now;
	FOZRadio R; R.From = From->CallSign; R.Text = Text; R.Time = Now;
	RadioLog.Add(R);
}

void AOZGameMode::Explode(const UObject* Ctx, const FVector& Where, float Radius, float Damage, AOZCharacter* ByCharacter)
{
	UWorld* W = Ctx ? Ctx->GetWorld() : nullptr;
	if (!W) return;
	if (AOZEffects* FX = AOZEffects::Get(Ctx)) FX->Explosion(Where, Radius);
	OZSound::Play(Ctx, OZSound::EKind::Explosion, Where, FMath::FRandRange(0.9f, 1.1f), 1.5f);
	ReportNoise(Ctx, Where, 16000.f, ByCharacter);
	const FVector Origin = Where + FVector(0, 0, 40);
	FCollisionQueryParams Q(SCENE_QUERY_STAT(OZExplosion), false);
	for (AOZCharacter* C : Characters(Ctx))
	{
		if (!C->bAlive) continue;
		const FVector Chest = C->GetActorLocation() + FVector(0, 0, 30);
		const float D = FVector::Dist(Chest, Where);
		// jogador sente o tranco mesmo fora do raio de dano
		if (C->IsPlayerControlled() && D < Radius * 3.f && C->GetController())
		{
			FRotator R = C->GetController()->GetControlRotation();
			const float S = FMath::Clamp(1.4f - D / (Radius * 3.f), 0.f, 1.2f) * 2.5f;
			R.Pitch += FMath::FRandRange(-S, S); R.Yaw += FMath::FRandRange(-S, S);
			C->GetController()->SetControlRotation(R);
		}
		if (D > Radius) continue;
		FHitResult Hit;
		if (W->LineTraceSingleByChannel(Hit, Origin, Chest, ECC_Visibility, Q)) continue; // coberto
		const float K = FMath::Pow(1.f - D / Radius, 1.2f);
		C->ApplyHit(Damage * K, EOZHitRegion::Chest, ByCharacter, (Chest - Where).GetSafeNormal(), "frag", true, ByCharacter ? FVector::Dist(ByCharacter->GetActorLocation(), C->GetActorLocation()) : 0.f);
		C->Suppression = 1.5f;
	}
	TArray<AOZBlock*> Blocks;
	for (TActorIterator<AOZBlock> It(W); It; ++It) if (FVector::Dist(It->GetActorLocation(), Where) < Radius + 150.f) Blocks.Add(*It);
	for (AOZBlock* B : Blocks)
	{
		const float D = FVector::Dist(B->GetActorLocation(), Where);
		B->TakeHit(Damage * 2.2f * FMath::Max(0.f, 1.f - D / (Radius + 150.f)) + 20.f, true, ByCharacter);
	}
}
