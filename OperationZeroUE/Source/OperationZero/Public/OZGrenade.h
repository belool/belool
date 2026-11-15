#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "OZGrenade.generated.h"

class USphereComponent;
class UProjectileMovementComponent;
class AOZCharacter;

// Granada de fragmentação: quica pelo cenário e explode após 3 s.
UCLASS()
class OPERATIONZERO_API AOZGrenade : public AActor
{
	GENERATED_BODY()
public:
	AOZGrenade();
	void Launch(const FVector& Velocity, AOZCharacter* Thrower);
	virtual void Tick(float DeltaSeconds) override;

	UPROPERTY(VisibleAnywhere, Category = "OZ") USphereComponent* Collision;
	UPROPERTY(VisibleAnywhere, Category = "OZ") UProjectileMovementComponent* Movement;
	float Fuse = 3.f;
	TWeakObjectPtr<AOZCharacter> ThrownBy;
};
