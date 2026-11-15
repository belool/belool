#include "OZAIController.h"
#include "OZCharacter.h"
#include "OZGameMode.h"
#include "OZGrenade.h"
#include "NavigationSystem.h"
#include "Navigation/PathFollowingComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Engine/World.h"

AOZAIController::AOZAIController()
{
	PrimaryActorTick.bCanEverTick = true;
	bSetControlRotationFromPawnOrientation = false; // a mira é controlada aqui
}

AOZCharacter* AOZAIController::Me() const { return Cast<AOZCharacter>(GetPawn()); }

void AOZAIController::OnPossess(APawn* InPawn)
{
	Super::OnPossess(InPawn);
	PerceiveT = FMath::FRand() * 0.3f; ThinkT = FMath::FRand() * 0.5f;
	LookYaw = InPawn->GetActorRotation().Yaw;
	SetControlRotation(InPawn->GetActorRotation());
	const int32 Pick = FMath::RandRange(0, 3);
	Role = Pick == 0 ? EOZAIRole::Suppress : Pick == 1 ? EOZAIRole::FlankLeft : Pick == 2 ? EOZAIRole::FlankRight : EOZAIRole::Assault;
}

bool AOZAIController::HasLOS(const FVector& From, const FVector& To) const
{
	FHitResult Hit;
	FCollisionQueryParams Q(SCENE_QUERY_STAT(OZSight), false, GetPawn());
	return !GetWorld()->LineTraceSingleByChannel(Hit, From, To, ECC_Visibility, Q);
}

void AOZAIController::Say(const FString& Text, bool bImportant)
{
	if (AOZGameMode* GM = AOZGameMode::Get(this)) GM->Radio(Me(), Text, bImportant);
}

// ---------------------------------------------------------------- percepção
void AOZAIController::Perceive()
{
	AOZCharacter* C = Me();
	const FVector Eye = C->EyeLocation(), Fwd = GetControlRotation().Vector();
	AOZCharacter* Best = nullptr; float BestScore = -1e9f;
	AOZGameMode* GM = AOZGameMode::Get(this);
	for (AOZCharacter* E : AOZGameMode::Characters(this))
	{
		if (E == C || !E->bAlive || E->Team == C->Team) continue;
		const FVector To = E->GetActorLocation() - Eye;
		const float D = To.Size();
		float ViewDist = 14000.f / (1.f + 0.f);
		if (E->bIsCrouched && GetWorld()->TimeSeconds - E->LastShotTime > 2.f) ViewDist *= 0.75f;
		if (D > ViewDist) continue;
		const float Dot = FVector::DotProduct(To.GetSafeNormal(), Fwd);
		if (!(Dot > 0.2f || D < 700.f || (State == EOZAIState::Combat && Dot > -0.2f))) continue;
		if (!HasLOS(Eye, E->EyeLocation()) && !HasLOS(Eye, E->GetActorLocation() + FVector(0, 0, 20))) continue;
		if (GM) GM->ReportEnemy(C->Team, E, E->GetActorLocation(), C);
		float Score = -D;
		if (E == Target.Get()) Score += 1500.f;
		if (E->IsPlayerControlled()) Score += 600.f;
		if (GetWorld()->TimeSeconds - E->LastShotTime < 2.f) Score += 800.f;
		if (Score > BestScore) { BestScore = Score; Best = E; }
	}
	if (Best)
	{
		if (Best != Target.Get() || !bTargetVisible)
		{
			const float D = FVector::Dist(Best->GetActorLocation(), C->GetActorLocation());
			Reaction = ReactionBase * (0.6f + FMath::Min(1.f, D / 6000.f)) * (State == EOZAIState::Combat ? 0.5f : 1.f) * FMath::FRandRange(0.8f, 1.2f);
			Err = FMath::Max(Err, Err0 * (Best != Target.Get() ? 1.f : 0.6f));
			if (State != EOZAIState::Combat && State != EOZAIState::Retreat) State = EOZAIState::Combat;
		}
		Target = Best; bTargetVisible = true;
		LastSeenPos = Best->GetActorLocation(); LastSeenTime = GetWorld()->TimeSeconds;
	}
	else bTargetVisible = false;
	// audição
	if (GM && !bTargetVisible)
		for (const FOZNoise& N : GM->Noises)
		{
			if (N.Source.IsValid() && N.Source->Team == C->Team) continue;
			if (FVector::Dist(N.Location, C->GetActorLocation()) > N.Radius) continue;
			InvestigatePos = N.Source.IsValid() ? N.Source->GetActorLocation() + FVector(FMath::FRandRange(-500, 500), FMath::FRandRange(-500, 500), 0) : N.Location;
			bInvestigate = true;
			if (State == EOZAIState::Patrol) { State = EOZAIState::Investigate; if (FMath::FRand() < 0.3f) Say(TEXT("Ouvi alguma coisa...")); }
		}
	// granadas próximas: fugir
	if (GM) for (const TWeakObjectPtr<AOZGrenade>& G : GM->Grenades)
		if (G.IsValid() && G->ThrownBy.Get() != C && FVector::Dist(G->GetActorLocation(), C->GetActorLocation()) < 900.f)
		{
			const FVector Away = (C->GetActorLocation() - G->GetActorLocation()).GetSafeNormal2D() * 1000.f;
			Say(TEXT("Granada!"), true);
			bInCover = false;
			MoveTo(C->GetActorLocation() + Away, true);
		}
}

void AOZAIController::OnDamaged(AOZCharacter* Attacker)
{
	if (Attacker && Attacker->Team != Me()->Team)
	{
		if (AOZGameMode* GM = AOZGameMode::Get(this)) GM->ReportEnemy(Me()->Team, Attacker, Attacker->GetActorLocation(), nullptr);
		if (!bTargetVisible) { Target = Attacker; LastSeenPos = Attacker->GetActorLocation(); LastSeenTime = GetWorld()->TimeSeconds; }
		if (State != EOZAIState::Retreat) State = EOZAIState::Combat;
	}
	ThinkT = FMath::Min(ThinkT, 0.1f);
	if (Me()->Health < Me()->MaxHealth * 0.5f && FMath::FRand() < 0.3f) Say(TEXT("Fui atingido!"), true);
}

void AOZAIController::OnNearMiss(AOZCharacter* Shooter)
{
	if (Shooter && !bTargetVisible) { Target = Shooter; LastSeenPos = Shooter->GetActorLocation(); LastSeenTime = GetWorld()->TimeSeconds; State = EOZAIState::Combat; }
	Err = FMath::Min(Err0 * 1.5f, Err + 0.02f);
}

// ---------------------------------------------------------------- movimento
void AOZAIController::MoveTo(const FVector& Dest, bool bUrgent)
{
	bUrgentMove = bUrgent;
	if (bHasGoal && FVector::Dist2D(Dest, MoveGoal) < 150.f) return;
	MoveGoal = Dest; bHasGoal = true;
	const EPathFollowingRequestResult::Type R = MoveToLocation(Dest, 80.f, true, true, true, true);
	// sem malha de navegação: anda direto até o ponto (com desvio simples)
	bDirectSteer = R == EPathFollowingRequestResult::Failed;
}

bool AOZAIController::FindCover(const FVector& Threat, bool bRetreat, FVector& Out) const
{
	AOZCharacter* C = Me();
	const FVector Pos = C->GetActorLocation();
	const FVector ThreatEye = Threat + FVector(0, 0, 70);
	UNavigationSystemV1* Nav = UNavigationSystemV1::GetCurrent<UNavigationSystemV1>(GetWorld());
	float BestScore = -1e9f; bool bFound = false;
	const float Range = C->CurrentWeapon().Stats.Range;
	for (int32 Ring = 1; Ring <= 4; Ring++)
		for (int32 i = 0; i < 10; i++)
		{
			const float A = (i + Ring * 0.37f) / 10.f * 2.f * UE_PI, R = Ring * (bRetreat ? 700.f : 400.f);
			FVector P = Pos + FVector(FMath::Cos(A) * R, FMath::Sin(A) * R, 0.f);
			if (Nav)
			{
				FNavLocation NL;
				if (Nav->ProjectPointToNavigation(P, NL, FVector(150.f, 150.f, 300.f))) P = NL.Location;
			}
			// precisa estar escondido da ameaça na altura de alguém agachado
			if (HasLOS(ThreatEye, P + FVector(0, 0, 10))) continue;
			// e encostado em algo (obstáculo a até 1,4 m)
			bool bNear = false;
			FHitResult H; FCollisionQueryParams Q(SCENE_QUERY_STAT(OZCover), false, C);
			for (int32 k = 0; k < 4 && !bNear; k++)
			{
				const FVector Dir(FMath::Cos(k * UE_PI / 2), FMath::Sin(k * UE_PI / 2), 0.f);
				bNear = GetWorld()->LineTraceSingleByChannel(H, P, P + Dir * 140.f, ECC_Visibility, Q);
			}
			if (!bNear) continue;
			const float DT = FVector::Dist2D(P, Threat), DM = FVector::Dist2D(P, Pos);
			float S = -DM * 0.4f;
			if (bRetreat) S += DT * 0.5f;
			else { S -= FMath::Abs(DT - FMath::Min(4000.f, Range * 0.9f)) * 0.15f; if (DT < 600.f) S -= 2000.f; }
			if (S > BestScore) { BestScore = S; Out = P; bFound = true; }
		}
	return bFound;
}

// ---------------------------------------------------------------- decisão
void AOZAIController::Think()
{
	AOZCharacter* C = Me();
	const float Now = GetWorld()->TimeSeconds;
	AOZGameMode* GM = AOZGameMode::Get(this);
	if (Target.IsValid() && (!Target->bAlive || Now - LastSeenTime > 25.f)) Target = nullptr;
	if (State == EOZAIState::Retreat)
	{
		if (Now > RetreatUntil) { State = Target.IsValid() ? EOZAIState::Combat : EOZAIState::Patrol; bInCover = true; }
		return;
	}
	if (Target.IsValid() && C->Health < C->MaxHealth * 0.3f)
	{
		FVector Cov;
		if (FindCover(LastSeenPos, true, Cov)) { State = EOZAIState::Retreat; RetreatUntil = Now + 8.f; CoverPos = Cov; MoveTo(Cov, true); Say(TEXT("Recuando para me tratar!"), true); return; }
	}
	if (Target.IsValid()) { State = EOZAIState::Combat; CombatThink(); return; }
	FVector Known;
	if (GM && GM->KnownEnemy(C->Team, Known, 12.f))
	{
		State = EOZAIState::Hunt;
		MoveTo(Known + FVector(FMath::FRandRange(-400, 400), FMath::FRandRange(-400, 400), 0), false);
		return;
	}
	if (bInvestigate)
	{
		State = EOZAIState::Investigate;
		MoveTo(InvestigatePos, false);
		if (FVector::Dist2D(C->GetActorLocation(), InvestigatePos) < 300.f) { bInvestigate = false; State = EOZAIState::Patrol; }
		return;
	}
	// patrulha entre pontos estratégicos
	State = EOZAIState::Patrol;
	IdleT -= 0.5f;
	if ((!bHasGoal || FVector::Dist2D(C->GetActorLocation(), MoveGoal) < 250.f) && IdleT <= 0.f && GM && GM->StrategicPoints.Num())
	{
		const FVector P = GM->StrategicPoints[FMath::RandRange(0, GM->StrategicPoints.Num() - 1)];
		MoveTo(P + FVector(FMath::FRandRange(-1200, 1200), FMath::FRandRange(-1200, 1200), 0), false);
		IdleT = FMath::FRandRange(2.f, 6.f);
	}
}

void AOZAIController::CombatThink()
{
	AOZCharacter* C = Me();
	const float Now = GetWorld()->TimeSeconds;
	const float Dist = FVector::Dist2D(LastSeenPos, C->GetActorLocation());
	const float Unseen = Now - LastSeenTime;
	const float Range = C->CurrentWeapon().Stats.Range;
	// granada contra alvo entrincheirado
	if (Unseen > 1.5f && Unseen < 8.f && Dist > 800.f && Dist < 3000.f && C->Frags > 0 && Now - LastThrow > 10.f && FMath::FRand() < 0.15f)
	{
		LastThrow = Now;
		const FVector To = LastSeenPos - C->GetActorLocation();
		const float Pitch = FMath::RadiansToDegrees(0.5f * FMath::Asin(FMath::Clamp(Dist * 1570.f / (1900.f * 1900.f), 0.f, 1.f)));
		SetControlRotation(FRotator(FMath::Clamp(Pitch - 8.f, -10.f, 50.f), To.Rotation().Yaw, 0.f));
		C->ThrowGrenade();
		Say(TEXT("Granada saindo!"), true);
		return;
	}
	// sob supressão pesada: cobertura
	if (C->Suppression > 0.8f && !bInCover)
	{
		FVector Cov;
		if (FindCover(LastSeenPos, false, Cov)) { CoverPos = Cov; MoveTo(Cov, true); bInCover = true; PeekT = FMath::FRandRange(0.8f, 2.f); return; }
	}
	switch (Role)
	{
	case EOZAIRole::FlankLeft:
	case EOZAIRole::FlankRight:
	{
		if (!bHasFlank)
		{
			const FVector Away = (C->GetActorLocation() - LastSeenPos).GetSafeNormal2D();
			const FVector Side = FVector(-Away.Y, Away.X, 0.f) * (Role == EOZAIRole::FlankLeft ? 1.f : -1.f);
			FlankPoint = LastSeenPos + Side * FMath::Clamp(Dist * 0.6f, 1000.f, 2200.f) + Away * 600.f;
			bHasFlank = true;
			Say(Role == EOZAIRole::FlankLeft ? TEXT("Flanqueando pela esquerda!") : TEXT("Flanqueando pela direita!"));
		}
		bInCover = false;
		MoveTo(FlankPoint, !bTargetVisible);
		if (FVector::Dist2D(C->GetActorLocation(), FlankPoint) < 250.f || (bTargetVisible && Dist < 1400.f)) { Role = EOZAIRole::Assault; bHasFlank = false; }
		break;
	}
	case EOZAIRole::Suppress:
		if (!bInCover)
		{
			FVector Cov;
			if (FindCover(LastSeenPos, false, Cov) && FVector::Dist2D(Cov, C->GetActorLocation()) < 1400.f) { CoverPos = Cov; MoveTo(Cov, true); bInCover = true; }
			else StopMovement();
		}
		if (Unseen > 9.f) Role = EOZAIRole::Assault;
		break;
	default:
	{
		const float Pref = FMath::Clamp(Range * 0.8f, 800.f, 4500.f);
		if (!bTargetVisible) { bInCover = false; MoveTo(LastSeenPos + FVector(FMath::FRandRange(-300, 300), FMath::FRandRange(-300, 300), 0), Unseen < 5.f); }
		else if (Dist > Pref)
		{
			FVector Cov;
			if (FindCover(LastSeenPos, false, Cov) && FVector::Dist2D(Cov, LastSeenPos) < Dist - 300.f) { CoverPos = Cov; MoveTo(Cov, false); }
			else MoveTo(LastSeenPos, false);
		}
		else { StopMovement(); bHasGoal = false; }
	}
	}
}

// ---------------------------------------------------------------- execução
void AOZAIController::Tick(float Dt)
{
	Super::Tick(Dt);
	AOZCharacter* C = Me();
	if (!C) return;
	C->bWantsFire = false; C->bFirePressed = false; C->bWantsAds = false; C->bWantsSprint = false;
	if (!C->bAlive) { bHasGoal = false; Target = nullptr; bTargetVisible = false; State = EOZAIState::Patrol; StopMovement(); return; }
	PerceiveT -= Dt; ThinkT -= Dt;
	if (PerceiveT <= 0.f) { PerceiveT = 0.18f + FMath::FRand() * 0.12f; Perceive(); }
	if (ThinkT <= 0.f) { ThinkT = 0.45f + FMath::FRand() * 0.35f; Think(); }
	// sem navmesh: direção direta + "bigodes" para desviar
	if (bDirectSteer && bHasGoal)
	{
		FVector To = MoveGoal - C->GetActorLocation(); To.Z = 0.f;
		if (To.Size() > 100.f)
		{
			FVector Dir = To.GetSafeNormal();
			FHitResult H; FCollisionQueryParams Q(SCENE_QUERY_STAT(OZSteer), false, C);
			const FVector From = C->GetActorLocation();
			if (GetWorld()->LineTraceSingleByChannel(H, From, From + Dir * 200.f, ECC_Visibility, Q))
				Dir = (Dir + FVector(-Dir.Y, Dir.X, 0.f) * 1.2f).GetSafeNormal();
			C->AddMovementInput(Dir, 1.f);
		}
		else bHasGoal = false;
	}
	// travou? tenta pular e recalcular
	StuckT += Dt;
	if (StuckT > 1.5f)
	{
		if (bHasGoal && FVector::Dist2D(C->GetActorLocation(), LastProgressPos) < 50.f) { C->Jump(); const FVector G = MoveGoal; bHasGoal = false; MoveTo(G, bUrgentMove); }
		StuckT = 0.f; LastProgressPos = C->GetActorLocation();
	}
	C->bWantsSprint = bUrgentMove && !bTargetVisible && bHasGoal;
	// agachar em cobertura e espiar
	if (bInCover && State == EOZAIState::Combat)
	{
		PeekT -= Dt;
		if (PeekT <= 0.f) { bPeeking = !bPeeking; PeekT = bPeeking ? FMath::FRandRange(1.2f, 2.6f) : FMath::FRandRange(0.6f, 1.6f); }
		if (!bPeeking && !C->bIsCrouched) C->Crouch();
		else if (bPeeking && C->bIsCrouched) C->UnCrouch();
	}
	else if (C->bIsCrouched) C->UnCrouch();
	Aim(Dt);
	// regeneração lenta fora de perigo
	if (GetWorld()->TimeSeconds - C->LastDamageTime > 8.f && C->Health < C->MaxHealth) C->Health = FMath::Min(C->MaxHealth, C->Health + Dt * 6.f);
}

void AOZAIController::Aim(float Dt)
{
	AOZCharacter* C = Me();
	const FVector Eye = C->EyeLocation();
	FVector AimPt = FVector::ZeroVector; bool bHasAim = false;
	const float Now = GetWorld()->TimeSeconds;
	if (Target.IsValid() && bTargetVisible)
	{
		AimPt = Target->GetActorLocation() + FVector(0, 0, 25);
		const float Lead = FVector::Dist(Eye, AimPt) / FMath::Max(1.f, C->CurrentWeapon().Stats.Velocity);
		AimPt += Target->GetVelocity() * Lead;
		bHasAim = true;
	}
	else if (Target.IsValid() && Now - LastSeenTime < 4.f) { AimPt = LastSeenPos + FVector(0, 0, 30); bHasAim = true; }
	FRotator R = GetControlRotation();
	float WantYaw = LookYaw, WantPitch = 0.f;
	if (bHasAim) { const FRotator To = (AimPt - Eye).Rotation(); WantYaw = To.Yaw; WantPitch = To.Pitch; }
	else if (!C->GetVelocity().IsNearlyZero(10.f)) WantYaw = C->GetVelocity().Rotation().Yaw;
	const float DYaw = FRotator::NormalizeAxis(WantYaw - R.Yaw);
	const float Step = TurnRate * Dt;
	R.Yaw += FMath::Clamp(DYaw, -Step, Step);
	R.Pitch = FMath::Clamp(FRotator::NormalizeAxis(R.Pitch) + FMath::Clamp(WantPitch - FRotator::NormalizeAxis(R.Pitch), -Step, Step), -80.f, 80.f);
	SetControlRotation(R);
	// erro de mira: cai com o tempo de rastreio, sobe com movimento e supressão
	const float Moving = C->GetVelocity().Size2D() > 100.f ? 1.f : 0.f;
	const float TgtMoving = Target.IsValid() ? FMath::Min(1.f, Target->GetVelocity().Size2D() / 500.f) : 0.f;
	const float ErrTarget = ErrMin * (1.f + Moving * 0.5f + C->Suppression * 1.2f + TgtMoving * 0.5f);
	Err += (ErrTarget - Err) * FMath::Min(1.f, ErrDecay * Dt * 6.f);
	ErrT -= Dt;
	if (ErrT <= 0.f) { ErrT = 0.25f; ErrVec = FVector2D(FMath::FRandRange(-1.f, 1.f), FMath::FRandRange(-1.f, 1.f)) * Err; }
	C->AimError = ErrVec;
	// disparo em rajadas
	Reaction -= Dt;
	if (!bTargetVisible || Reaction > 0.f || FMath::Abs(DYaw) > 7.f) { Burst = 0; return; }
	const float Dist = FVector::Dist(Eye, AimPt);
	const FOZWeaponState& W = C->CurrentWeapon();
	if (Dist > FMath::Max(5000.f, W.Stats.Range * 2.2f)) return;
	if (W.Stats.IsMelee() && Dist > 230.f) return;
	// não atira se um aliado estiver na linha
	for (AOZCharacter* O : AOZGameMode::Characters(this))
	{
		if (O == C || !O->bAlive || O->Team != C->Team) continue;
		const FVector To = O->GetActorLocation() - Eye, Dir = (AimPt - Eye).GetSafeNormal();
		const float Along = FVector::DotProduct(To, Dir);
		if (Along > 0.f && Along < Dist && (To - Dir * Along).Size2D() < 80.f) return;
	}
	if (Dist > 1200.f || W.Stats.Class == EOZWeaponClass::Sniper || W.Stats.Class == EOZWeaponClass::DMR) C->bWantsAds = true;
	BurstPause -= Dt;
	if (BurstPause > 0.f) return;
	if (W.CurrentMode == EOZFireMode::Auto)
	{
		C->bWantsFire = true;
		if (W.Cooldown <= 0.f && W.InMag > 0) Burst++;
		const int32 MaxBurst = Dist < 1200.f ? 8 : Dist < 3000.f ? 5 : 3;
		if (Burst >= MaxBurst) { Burst = 0; BurstPause = FMath::FRandRange(0.2f, 0.5f) * (Dist / 2000.f + 0.6f); }
	}
	else
	{
		C->bFirePressed = W.CanFire();
		if (C->bFirePressed) BurstPause = W.CurrentMode == EOZFireMode::Bolt ? FMath::FRandRange(0.9f, 1.6f) : FMath::FRandRange(0.18f, 0.45f) * (1.f + Dist / 4000.f);
	}
}
