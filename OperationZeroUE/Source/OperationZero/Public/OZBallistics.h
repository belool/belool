#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "OZTypes.h"
#include "OZBallistics.generated.h"

class AOZCharacter;

// ================================================================
// Balística simulada: cada projétil tem velocidade e cai com a
// gravidade; atravessa materiais conforme densidade x espessura
// (madeira sim, concreto não; munição perfurante vai mais longe),
// causa dano por região corporal e "supressão" ao passar perto.
// ================================================================
USTRUCT()
struct FOZProjectile
{
	GENERATED_BODY()
	FVector Pos = FVector::ZeroVector;
	FVector Vel = FVector::ZeroVector;
	float Power = 0.f;
	float Power0 = 1.f;
	float Traveled = 0.f;
	float Life = 3.f;
	bool bTracer = true;
	FOZWeaponStats Stats;
	TWeakObjectPtr<AOZCharacter> Shooter;
	TSet<TWeakObjectPtr<AOZCharacter>> Hit;
	TSet<TWeakObjectPtr<AOZCharacter>> Near;
};

UCLASS()
class OPERATIONZERO_API UOZBallistics : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	void Fire(AOZCharacter* Shooter, const FVector& Origin, const FVector& Dir, const FOZWeaponStats& Stats, bool bTracer);

	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override { RETURN_QUICK_DECLARE_CYCLE_STAT(UOZBallistics, STATGROUP_Tickables); }

private:
	// Processa um trecho do voo; retorna false quando o projétil para.
	bool Segment(FOZProjectile& P, const FVector& From, const FVector& Dir, float Len);
	TArray<FOZProjectile> Projectiles;
};
