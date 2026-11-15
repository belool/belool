#pragma once

#include "CoreMinimal.h"
#include "AIController.h"
#include "OZAIController.generated.h"

class AOZCharacter;

UENUM()
enum class EOZAIState : uint8 { Patrol, Investigate, Hunt, Combat, Retreat };
UENUM()
enum class EOZAIRole : uint8 { Assault, Suppress, FlankLeft, FlankRight };

// ================================================================
// IA tática (porte do AIBrain web): visão com campo de visão e linha
// de visão, audição de tiros/passos/explosões, tempo de reação e erro
// de mira que diminui ao rastrear o alvo, cobertura que realmente
// esconde da ameaça, papéis (assalto/supressão/flanco), recuo quando
// ferida, granadas contra quem está entrincheirado, fuga de granadas
// e comunicação com a equipe via AOZGameMode.
// ================================================================
UCLASS()
class OPERATIONZERO_API AOZAIController : public AAIController
{
	GENERATED_BODY()

public:
	AOZAIController();
	virtual void OnPossess(APawn* InPawn) override;
	virtual void Tick(float DeltaSeconds) override;

	void OnDamaged(AOZCharacter* Attacker);
	void OnNearMiss(AOZCharacter* Shooter);

	EOZAIState State = EOZAIState::Patrol;
	EOZAIRole Role = EOZAIRole::Assault;

protected:
	AOZCharacter* Me() const;
	void Perceive();
	void Think();
	void CombatThink();
	void Aim(float Dt);
	void MoveTo(const FVector& Dest, bool bUrgent);
	bool FindCover(const FVector& Threat, bool bRetreat, FVector& Out) const;
	bool HasLOS(const FVector& From, const FVector& To) const;
	void Say(const FString& Text, bool bImportant = false);

	TWeakObjectPtr<AOZCharacter> Target;
	bool bTargetVisible = false;
	FVector LastSeenPos = FVector::ZeroVector;
	float LastSeenTime = -100.f;
	FVector InvestigatePos = FVector::ZeroVector;
	bool bInvestigate = false;
	FVector MoveGoal = FVector::ZeroVector;
	bool bHasGoal = false;
	bool bDirectSteer = false;
	bool bUrgentMove = false;
	FVector CoverPos = FVector::ZeroVector;
	bool bInCover = false;
	bool bPeeking = false;
	float PeekT = 0.f;
	FVector FlankPoint = FVector::ZeroVector;
	bool bHasFlank = false;
	float PerceiveT = 0.f, ThinkT = 0.f, Reaction = 0.f, Err = 0.05f, ErrT = 0.f, BurstPause = 0.f, StrafeT = 0.f, RetreatUntil = 0.f, LastThrow = -100.f, IdleT = 0.f;
	int32 Burst = 0;
	float Strafe = 0.f;
	FVector2D ErrVec = FVector2D::ZeroVector;
	float LookYaw = 0.f;
	FVector LastProgressPos = FVector::ZeroVector;
	float StuckT = 0.f;
	// dificuldade "Regular"
	float ReactionBase = 0.55f, Err0 = 0.05f, ErrMin = 0.0105f, ErrDecay = 0.32f, TurnRate = 260.f;
};
