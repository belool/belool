#include "OZGrenade.h"
#include "OZShapes.h"
#include "OZGameMode.h"
#include "OZCharacter.h"
#include "Components/SphereComponent.h"
#include "GameFramework/ProjectileMovementComponent.h"

AOZGrenade::AOZGrenade()
{
	PrimaryActorTick.bCanEverTick = true;
	Collision = CreateDefaultSubobject<USphereComponent>(TEXT("Collision"));
	Collision->InitSphereRadius(7.f);
	Collision->SetCollisionProfileName(TEXT("BlockAllDynamic"));
	Collision->SetCollisionResponseToChannel(ECC_Pawn, ECR_Ignore);
	RootComponent = Collision;
	Movement = CreateDefaultSubobject<UProjectileMovementComponent>(TEXT("Movement"));
	Movement->bShouldBounce = true;
	Movement->Bounciness = 0.4f;
	Movement->Friction = 0.3f;
	Movement->ProjectileGravityScale = 1.6f;
	Movement->InitialSpeed = 0.f;
	Movement->bAutoActivate = false;
}

void AOZGrenade::Launch(const FVector& Velocity, AOZCharacter* Thrower)
{
	ThrownBy = Thrower;
	OZShapes::AddPart(this, RootComponent, OZShapes::EShape::Sphere, FVector(13.f), FVector::ZeroVector, FLinearColor(0.08f, 0.1f, 0.05f));
	Movement->Velocity = Velocity;
	Movement->Activate();
	AOZGameMode::OnGrenadeThrown(this, this);
}

void AOZGrenade::Tick(float Dt)
{
	Super::Tick(Dt);
	Fuse -= Dt;
	if (Fuse <= 0.f)
	{
		AOZGameMode::Explode(this, GetActorLocation(), 750.f, 140.f, ThrownBy.Get());
		Destroy();
	}
}
